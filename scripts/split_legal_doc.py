import os
import re

INPUT_FILE = "C:\\Users\\Hogan\\OneDrive\\Arcanthyr\\arcanthyr-console\\hogan_on_crime.md"
OUTPUT_FOLDER = "blocks_3k"
TARGET_WORDS = 3000
MIN_WORDS = 2000
MAX_WORDS = 3500

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Read and clean encoding artefacts
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    text = f.read()

# Fix encoding artefacts from Word conversion
text = text.replace("Â", "").replace("\u00a0", " ")

# Remove the junk first line if present
lines = text.split("\n")
if lines and "Feldenkrais" in lines[0]:
    lines = lines[1:]
text = "\n".join(lines)

# Split into sections at any heading level (# ## ###)
# Each section includes its heading line
sections = re.split(r'(?=\n#{1,3} )', text)
sections = [s.strip() for s in sections if s.strip()]

def count_words(s):
    return len(s.split())

# Build blocks — prefer breaking at # level 1, fall back to ## 
blocks = []
current_block = []
current_count = 0

for section in sections:
    word_count = count_words(section)
    
    # If this single section exceeds max, force-add it as its own block
    if word_count > MAX_WORDS:
        if current_block:
            blocks.append("\n\n".join(current_block))
            current_block = []
            current_count = 0
        blocks.append(section)
        continue
    
    # If adding this section would exceed max
    if current_count + word_count > MAX_WORDS:
        # Only break here if we're at or above minimum
        if current_count >= MIN_WORDS:
            blocks.append("\n\n".join(current_block))
            current_block = [section]
            current_count = word_count
        else:
            # Below minimum — add anyway to avoid tiny blocks
            current_block.append(section)
            current_count += word_count
    else:
        current_block.append(section)
        current_count += word_count

# Don't forget the last block
if current_block:
    blocks.append("\n\n".join(current_block))

# Merge any undersized trailing blocks into the previous one
merged = []
for block in blocks:
    if merged and count_words(block) < MIN_WORDS:
        merged[-1] = merged[-1] + "\n\n" + block
    else:
        merged.append(block)

# Write output files
for i, block in enumerate(merged):
    filename = os.path.join(OUTPUT_FOLDER, f"block_{i+1:03}.txt")
    with open(filename, "w", encoding="utf-8") as f:
        f.write(block)
    print(f"Block {i+1:03}: {count_words(block)} words")

print(f"\nDone — {len(merged)} blocks written to {OUTPUT_FOLDER}/")
