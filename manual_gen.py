import json
import os
from data_part1 import get_batch1_data
from data_part2 import get_batch2_data

def generate_corpus():
    """
    Combines manually curated data batches into the final RAG corpus.
    """
    
    # 1. Fetch Data
    print("Fetching Batch 1 & 2 (Specialist)...")
    specialist_items = get_batch1_data()
    
    print("Fetching Batch 3 & 4 (Generalist)...")
    generalist_items = get_batch2_data()
    
    all_items = specialist_items + generalist_items
    
    print(f"Total items collected: {len(all_items)}")
    
    # 2. Validation & Processing
    processed_items = []
    ids = set()
    
    for item in all_items:
        # Validate Uniqueness
        if item['id'] in ids:
            print(f"WARNING: Duplicate ID found: {item['id']}")
            continue
        ids.add(item['id'])
        
        # Ensure strict structure
        processed_item = {
            "id": item["id"],
            "seniority": item["seniority"],
            "is_ai_enhanced": item["is_ai_enhanced"],
            "industry": item["industry"],
            "job_role": item["job_role"],
            "skills": item["skills"],
            "star": item["star"],
            "resume_bullets": item["resume_bullets"]
        }
        processed_items.append(processed_item)

    # 3. Write to File
    output_path = "master_cases_complete_2026.json"
    legacy_path = "master_cases.json"
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(processed_items, f, ensure_ascii=False, indent=4)
        
    with open(legacy_path, "w", encoding="utf-8") as f:
         json.dump(processed_items, f, ensure_ascii=False, indent=4)
         
    print(f"Successfully generated {len(processed_items)} items to {output_path}")

if __name__ == "__main__":
    generate_corpus()
