# Plan: Fix Workflow Tests to Properly Mock Drag & Drop

## Current Problem

The test `simulateFileUpload` function creates real `File` objects in a
`DataTransfer`, but:

- Real `File` objects don't have `webkitGetAsEntry()` method
- FileUploader now intelligently routes to `FileList` processing when no
  directories detected
- This bypasses the actual drag & drop directory handling code we want to test

## Solution: Create Proper Mock Objects

### Step 1: Create Mock FileSystemEntry Hierarchy

- **FileSystemFileEntry**: Mock with `file(successCallback, errorCallback)`
  method that calls success with the File object
- **FileSystemDirectoryEntry**: Mock with `createReader()` returning a
  `FileSystemDirectoryReader`
- **FileSystemDirectoryReader**: Mock with `readEntries(successCallback)` for
  recursive directory traversal
- All entries need correct `name`, `isFile`, `isDirectory` properties

### Step 2: Create Mock DataTransferItem Objects

- Implement `webkitGetAsEntry()` that returns appropriate mock FileSystemEntry
- Maintain `getAsFile()` method for compatibility
- Set correct `kind` ("file") and `type` properties
- Support both individual files and directory structures

### Step 3: Update Test Projects Structure

- Add folder-based test projects (e.g., "complex" should be a folder with
  assets)
- Support nested directory structures in test data
- Create utilities to generate mock directory trees from file specifications

### Step 4: Test Both Processing Paths

- **Individual files**: Should trigger `FileList` processing path (no
  directories)
- **Folders**: Should trigger `DataTransferItemList` + `webkitGetAsEntry`
  processing path
- **Mixed scenarios**: Test edge cases and validation logic

### Step 5: Verify Directory Detection Logic

- Test that `hasDirectory` detection works correctly
- Ensure proper routing between processing methods
- Validate folder name detection and path stripping

## Files to Modify

- `/Users/robert/Offline-Documents/Collagen/tests/e2e/workflow.spec.ts` - Update
  simulateFileUpload function and test data structure
- Potentially create test utilities for mock object generation

## Benefits

- Tests will exercise actual FileUploader drag & drop logic
- Can test folder upload scenarios properly
- Validates the intelligent routing between processing methods
- More realistic simulation of browser drag & drop behavior
