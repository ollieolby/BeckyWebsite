// File types a manual can be uploaded as, shared by the family area form and
// the upload button in Ask Becky so the two cannot drift apart.
//
// .docx is here because the family's own documents are Word files and the
// site previously rejected every one of them. Legacy .doc is deliberately
// absent: nothing on the server can read it, so accepting it would only
// produce a document that can never be searched.
export const MANUAL_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

export const MANUAL_ACCEPT = '.pdf,.docx,.txt,.md';
export const MANUAL_MAX_BYTES = 150 * 1024 * 1024;

export function manualTypeFor(filename: string) {
  return MANUAL_TYPES[filename.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export function manualTypeError(filename: string) {
  if (/\.doc$/i.test(filename)) {
    return 'Old .doc files cannot be read. Open it in Word, save it as .docx and upload that.';
  }
  return 'Use a PDF, Word .docx, .txt or .md file.';
}
