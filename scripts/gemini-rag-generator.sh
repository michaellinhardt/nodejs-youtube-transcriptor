#!/bin/bash

# ============================================================================
# RAG Generator Batch Processor
# Processes multiple markdown files in parallel using Gemini CLI
# ============================================================================

# Configuration
AGENT_DEF="${AGENT_DEF:-$HOME/workspace/claude-code/claude-agents/agt-rag-generator.md}"
SEPARATOR=$'\n\n---\n\nTarget Data Below\n\n---\n\n'
MAX_PARALLEL=${MAX_PARALLEL:-2}  # Limit concurrent processes
VERBOSE=${VERBOSE:-1}  # Set to 0 to reduce output

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Initialize - Use regular arrays instead of associative for compatibility
processed=0
skipped=0
failed=0
total_files=0
declare -a pids
declare -a file_names
declare -a file_size_list
declare -a start_time_list
script_start_time=$(date +%s)

# Functions
log() {
    echo -e "$1"
}

log_verbose() {
    [[ $VERBOSE -eq 1 ]] && echo -e "${GRAY}[$(date +%H:%M:%S)] $1${NC}"
}

get_file_size_human() {
    local size
    # macOS and Linux have different stat syntax
    if [[ "$OSTYPE" == "darwin"* ]]; then
        size=$(stat -f%z "$1" 2>/dev/null)
    else
        size=$(stat -c%s "$1" 2>/dev/null)
    fi
    
    if [[ -z "$size" ]]; then
        echo "0B"
        return
    fi
    
    if [[ $size -lt 1024 ]]; then
        echo "${size}B"
    elif [[ $size -lt 1048576 ]]; then
        echo "$((size / 1024))KB"
    else
        echo "$((size / 1048576))MB"
    fi
}

# Header
clear
log "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
log "${CYAN}║           RAG Generator Batch Processor v1.0                  ║${NC}"
log "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
log ""
log "${BLUE}📅 Started: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
log "${BLUE}📁 Working Directory: $(pwd)${NC}"
log "${BLUE}🔧 Max Parallel Jobs: $MAX_PARALLEL${NC}"
log ""

# Check prerequisites
log "${YELLOW}═══ Checking Prerequisites ═══${NC}"
if [[ ! -f "$AGENT_DEF" ]]; then
    log "${RED}❌ Error: Agent definition not found at:${NC}"
    log "${RED}   $AGENT_DEF${NC}"
    log "${RED}   Please ensure the agent file exists or set AGENT_DEF environment variable${NC}"
    exit 1
else
    log "${GREEN}✅ Agent definition found:${NC}"
    log "${GRAY}   $AGENT_DEF ($(get_file_size_human "$AGENT_DEF"))${NC}"
fi

# Check for gemini CLI
if ! command -v gemini &> /dev/null; then
    log "${RED}❌ Error: 'gemini' CLI not found in PATH${NC}"
    log "${RED}   Please install gemini CLI first${NC}"
    exit 1
else
    log "${GREEN}✅ Gemini CLI found: $(which gemini)${NC}"
fi

# First pass: Count total markdown files
for f in *.md; do
    if [[ -f "$f" ]]; then
        ((total_files++))
    fi
done

if [[ $total_files -eq 0 ]]; then
    log "${YELLOW}⚠️  No markdown files found in current directory${NC}"
    exit 0
fi

# Second pass: Categorize files and build arrays
log ""
log "${YELLOW}═══ Scanning Files ═══${NC}"
to_process=0
file_index=0

for f in *.md; do
    if [[ ! -f "$f" ]]; then
        continue
    fi
    
    if [[ "$f" == rag_* ]]; then
        log_verbose "  ${GRAY}⏭️  Skipping (already processed): $f${NC}"
        ((skipped++))
    else
        file_size=$(get_file_size_human "$f")
        # Store in parallel arrays
        file_names[$file_index]="$f"
        file_size_list[$file_index]="$file_size"
        log "${CYAN}  📄 Found: $f ($file_size)${NC}"
        ((to_process++))
        ((file_index++))
    fi
done

log ""
log "${MAGENTA}📊 Pre-processing Summary:${NC}"
log "  • Total markdown files: $total_files"
log "  • Files to process: $to_process"
log "  • Files to skip: $skipped"
log ""

if [[ $to_process -eq 0 ]]; then
    log "${YELLOW}⚠️  No files need processing. All files already have 'rag_' prefix.${NC}"
    exit 0
fi

# Process files
log "${YELLOW}═══ Processing Files ═══${NC}"
log "${GRAY}Using parallel processing with max $MAX_PARALLEL concurrent jobs${NC}"
log ""

# Store initial rag files to track new ones
initial_rag_files=$(ls rag_*.md 2>/dev/null | wc -l)

file_number=0
for idx in "${!file_names[@]}"; do
    f="${file_names[$idx]}"
    file_size="${file_size_list[$idx]}"
    
    ((file_number++))
    
    # Wait if we've hit the parallel limit
    if [[ ${#pids[@]} -ge $MAX_PARALLEL ]]; then
        wait_start=$(date +%s)
        while [[ ${#pids[@]} -ge $MAX_PARALLEL ]]; do
            new_pids=()
            for pid in "${pids[@]}"; do
                if kill -0 "$pid" 2>/dev/null; then
                    new_pids+=("$pid")
                fi
            done
            pids=("${new_pids[@]}")
            
            # Only show waiting message if still at limit
            if [[ ${#pids[@]} -ge $MAX_PARALLEL ]]; then
                wait_elapsed=$(($(date +%s) - wait_start))
                printf "\r${GRAY}⏳ Waiting for a job slot to free up (${#pids[@]}/$MAX_PARALLEL running) - ${wait_elapsed}s${NC}"
            fi
            
            sleep 0.5
        done
        # Clear the waiting line
        printf "\r\033[K"
    fi
    
    log "${BLUE}[$file_number/$to_process] Processing: $f${NC}"
    log_verbose "  ${GRAY}→ Input: $f ($file_size)${NC}"
    
    # Store start time
    start_time_list[$idx]=$(date +%s)
    
    # Run gemini in background - let it create its own files, don't capture stdout
    {
        local_start=$(date +%s)
        current_file="$f"
        
        # Create temp file for error capture only
        temp_error=$(mktemp)
        
        # Run Gemini and let it create its own output file, capture only status/errors
        if { cat "$AGENT_DEF"; echo "$SEPARATOR"; cat "$current_file"; } | gemini --yolo > /dev/null 2> "$temp_error"; then
            # Success
            local_end=$(date +%s)
            duration=$((local_end - local_start))
            
            log "${GREEN}✅ Completed: $current_file (${duration}s)${NC}"
        else
            # Failure
            local_end=$(date +%s)
            duration=$((local_end - local_start))
            error_msg=$(cat "$temp_error")
            
            log "${RED}❌ Failed: $current_file${NC}"
            log "${RED}   → Error: ${error_msg:-Unknown error}${NC}"
            log "${RED}   → Duration: ${duration}s${NC}"
            
            ((failed++))
        fi
        
        # Cleanup temp files
        rm -f "$temp_error" 2>/dev/null
    } &
    
    # Track PID BEFORE showing the job slots count
    pid=$!
    pids+=("$pid")
    
    # Now show accurate count after adding the PID
    log_verbose "  ${GRAY}→ Started background job PID: $pid${NC}"
    log_verbose "  ${GRAY}→ Job slots: ${#pids[@]}/$MAX_PARALLEL active${NC}"
    ((processed++))
    
    # Small delay to prevent overwhelming the system
    sleep 0.2
done

# Wait for all background jobs
log ""
log "${YELLOW}⏳ Waiting for ${#pids[@]} background jobs to complete...${NC}"

# Show spinner while waiting with elapsed time
spinner=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
spin_idx=0
final_wait_start=$(date +%s)
while [[ ${#pids[@]} -gt 0 ]]; do
    # Check which PIDs are still running
    running=0
    new_pids=()
    for pid in "${pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            new_pids+=("$pid")
            ((running++))
        fi
    done
    pids=("${new_pids[@]}")
    
    if [[ $running -gt 0 ]]; then
        elapsed=$(($(date +%s) - final_wait_start))
        printf "\r${CYAN}${spinner[$spin_idx]} Processing... ($running jobs remaining) - ${elapsed}s${NC}"
        spin_idx=$(( (spin_idx + 1) % ${#spinner[@]} ))
    fi
    
    sleep 0.1
done

printf "\r${GREEN}✅ All jobs completed!                                    ${NC}\n"

# Wait to ensure all background processes are done
wait

# Calculate total duration
script_end_time=$(date +%s)
total_duration=$((script_end_time - script_start_time))
minutes=$((total_duration / 60))
seconds=$((total_duration % 60))

# Count new RAG files created (excluding the ones we mistakenly created before)
new_rag_count=0
log ""
log "${GREEN}📁 Generated RAG files:${NC}"
for rag_file in rag_*.md; do
    if [[ -f "$rag_file" ]] && [[ "$rag_file" != "rag_*.md" ]] && [[ ! "$rag_file" =~ ^rag_transcript_ ]]; then
        log "  ${GRAY}• $rag_file ($(get_file_size_human "$rag_file"))${NC}"
        ((new_rag_count++))
    fi
done

# Final Summary
log ""
log "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
log "${CYAN}║                     Processing Complete                       ║${NC}"
log "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
log ""
log "${MAGENTA}📊 Final Summary:${NC}"
log "  ${GREEN}✅ Successfully processed: $((processed - failed)) files${NC}"
log "  ${GREEN}📁 New RAG files created: $new_rag_count${NC}"
log "  ${YELLOW}⏭️  Skipped (already done): $skipped files${NC}"
if [[ $failed -gt 0 ]]; then
    log "  ${RED}❌ Failed: $failed files${NC}"
fi
log "  ${BLUE}⏱️  Total duration: ${minutes}m ${seconds}s${NC}"

# Show any errors
if [[ $failed -gt 0 ]]; then
    log ""
    log "${RED}⚠️  Some files failed to process.${NC}"
fi

log ""
log "${BLUE}✨ Done at $(date '+%Y-%m-%d %H:%M:%S')${NC}"