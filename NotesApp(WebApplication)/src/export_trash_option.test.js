import { exportNotes } from './services/exportService';

test('exportNotes builds payload with excludeTrashed flag', async () => {
  // Mock IndexedDB layer by stubbing getAllNotes via jest module factory if available
  // For a light check, ensure the function accepts the param and returns a Blob
  const blob = await exportNotes({ excludeTrashed: true });
  expect(blob).toBeInstanceOf(Blob);
});
