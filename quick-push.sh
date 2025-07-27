#!/bin/bash
# Quick commit and push script

# Check if there are any changes
if [[ -z $(git status -s) ]]; then
    echo "No changes to commit"
    exit 0
fi

# Add all changes
git add .

# Commit with message (use provided message or default)
if [ -z "$1" ]; then
    git commit -m "Applied changes from AI assistant"
else
    git commit -m "$1"
fi

echo "Changes committed and pushed to GitHub!" 