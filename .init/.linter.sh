#!/bin/bash
cd /home/kavia/workspace/code-generation/notes-app-project-49114-49204/NotesAppWebApplication
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

