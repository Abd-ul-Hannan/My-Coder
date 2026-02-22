# Delete Button Test

## Issue
History delete button nahi chal raha - sessions delete nahi ho rahe

## Root Cause Analysis
Database file (`my-coder.db`) create hi nahi ho raha hai

## Fix Required
1. Ensure `storageUri` is properly initialized
2. Create directory if it doesn't exist
3. Initialize SQLite database properly

## Test Steps
1. Reload VS Code window
2. Open Developer Tools (Help > Toggle Developer Tools)
3. Check Console for initialization logs
4. Create a test session (send a message)
5. Try to delete the session
6. Check if database file is created at: `<workspace>/.vscode/my-coder.db`
