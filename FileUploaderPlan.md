# FileUploader E2E Test Rewrite Plan

## Overview
Complete rewrite of FileUploader E2E tests to comprehensively test all upload scenarios, error handling, and UI state management using real Playwright interactions.

## Key Testing Areas

### 1. Sample Projects Creation
Define test projects covering all scenarios:
- Valid single manifest files (JSON/Jsonnet)
- Valid folders with manifest and assets
- Invalid scenarios (missing manifest, malformed files)
- Multiple files/folders combinations

Format: `Record<string, Record<string, string>>` where:
```typescript
{
  projectName: { 
    filename1: stringContent1, 
    filename2: stringContent2 
  }
}
```

### 2. Mock FileSystemEntry API
Create realistic mocks for drag-and-drop testing:
- Mock `webkitGetAsEntry()` behavior
- Simulate `FileSystemFileEntry` and `FileSystemDirectoryEntry`
- Handle directory traversal with `createReader()`
- Maintain realistic async behavior

### 3. File Picker Testing
Test actual file input behavior:
- Click browse button
- Press 'O' keyboard shortcut
- Handle file selection via input element
- Test both single files and folder selection

### 4. Drag-and-Drop Testing
Test with mocked but realistic FileSystemEntry simulation:
- Mock drag events with proper DataTransfer
- Simulate various drop scenarios
- Test DataTransferItem lifecycle handling
- Verify proper async processing

### 5. Error Handling
Test all error scenarios FileUploader should catch:
- Missing `collagen.json` or `collagen.jsonnet`
- Multiple folders (invalid - no root manifest possible)
- Verify correct error messages displayed
- Ensure no SVG is produced on errors

### 6. Success Cases
Verify correct behavior on successful uploads:
- Accurate file/folder counting and detection
- Correct success messages ("File/Files/Folder/Folders/Items uploaded successfully")
- SVG viewer appears with correct content
- Verify SVG content (substrings or full expected output)

### 7. UI State Management
Test complete upload lifecycle:
- Initial state → processing → success/error → clear → repeat
- "Upload Another Project" button functionality
- Multiple upload cycles with error recovery
- State persistence between uploads

### 8. Message Accuracy
Verify precise messaging based on upload type:
- Single file: "File uploaded successfully"
- Multiple files: "Files uploaded successfully"
- Single folder: "Folder uploaded successfully"
- Multiple folders: "Folders uploaded successfully"
- Mixed: "Items uploaded successfully"

## Test Scenarios to Cover

### Scenario 1: Single File Upload
- [ ] Single `collagen.json` file
- [ ] Single `collagen.jsonnet` file
- [ ] Invalid single file (no manifest)

### Scenario 2: Multiple Files
- [ ] Multiple files including manifest
- [ ] Multiple files without manifest (should fail)

### Scenario 3: Single Folder
- [ ] Folder with manifest and assets
- [ ] Folder without manifest (should fail)
- [ ] Test path stripping (folder/collagen.json → collagen.json)

### Scenario 4: Multiple Folders
- [ ] Multiple folders (must fail - no root manifest possible)

### Scenario 5: Mixed Files and Folders
- [ ] Files + folders combination
- [ ] Various valid/invalid combinations

### Scenario 6: Error Recovery
- [ ] Upload failure → successful retry
- [ ] Multiple upload cycles
- [ ] State reset between attempts

## Implementation Status

### Phase 1: Setup and Infrastructure
- [x] Create sample project definitions
- [x] Build FileSystemEntry mock utilities
- [x] Create upload helper functions
- [x] Set up test data structure

### Phase 2: Core Upload Testing
- [x] File picker upload tests
- [x] Drag-and-drop upload tests
- [x] Both methods for each scenario

### Phase 3: Error Handling
- [x] Missing manifest tests
- [x] Invalid file tests
- [x] Multiple folder rejection tests

### Phase 4: Success Verification
- [x] Message accuracy tests
- [x] SVG content verification
- [x] UI state transition tests

### Phase 5: Integration and Edge Cases
- [x] Multiple upload cycles
- [x] Error recovery testing
- [x] Edge case and robustness testing
- [x] Performance and stress testing
- [x] Accessibility testing
- [x] Responsive design testing

## Completed Features

✅ **Comprehensive Sample Projects**: Created 9 different project scenarios covering valid/invalid, single file, folders, multiple items
✅ **Simplified FileList Mocking**: Direct FileList creation and component method calls instead of complex browser API simulation
✅ **Upload Method Testing**: Both file picker and drag-and-drop testing using component method calls with mocked FileList objects
✅ **Error Scenario Coverage**: Missing manifests, malformed files, multiple folders, empty files
✅ **Success Message Verification**: Accurate "File/Files/Folder/Folders/Items uploaded successfully" testing
✅ **UI State Management**: Complete upload lifecycle testing including clear and re-upload
✅ **Edge Case Handling**: Rapid clicks, disabled states, keyboard accessibility, large file names
✅ **Performance Testing**: Large file counts, deep folder structures with timing verification using simplified approach
✅ **Accessibility Standards**: ARIA attributes, keyboard navigation, screen reader support
✅ **Responsive Design**: Desktop, tablet, and mobile viewport testing

## Final Implementation Approach

After initial complex FileSystemEntry API simulation, the implementation was simplified based on user feedback:

### **Simplified Testing Strategy**
- **Direct Component Method Calls**: Instead of simulating complex browser drag-and-drop APIs, tests call component methods directly with mocked FileList objects
- **FileList Mocking**: Create File objects with appropriate `webkitRelativePath` properties and construct FileList-compatible objects
- **Browser Security Limitations**: Acknowledges that real file picker/drag-and-drop cannot be programmatically triggered due to browser security restrictions

### **Key Benefits**
- **Maintainability**: Significantly reduced code complexity (~130 lines of complex mocking removed)
- **Reliability**: Avoids brittle browser API simulation that could break with browser updates
- **Test Coverage**: Maintains comprehensive coverage of all upload scenarios and error cases
- **Performance**: Faster test execution without complex async API simulation

### **Implementation Pattern**
```typescript
// Create FileList with webkitRelativePath for folder simulation
const fileObjects = Object.entries(files).map(([path, content]) => {
  const file = new File([content], path.split("/").pop()!);
  Object.defineProperty(file, "webkitRelativePath", {
    value: path, writable: false
  });
  return file;
});

// Call component methods directly
await window.__fileUploader.processFilesFromFileList(mockFileList);
```

## Notes
- Focus on errors FileUploader specifically catches (missing manifest files)
- Use simplified FileList mocking instead of complex browser API simulation
- Test both upload methods by calling component methods directly
- Verify UI state management throughout entire upload lifecycle
- Maintain comprehensive test coverage while keeping implementation simple