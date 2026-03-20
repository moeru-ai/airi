import fs from 'node:fs';
const path = 'C:\\Users\\h4rdc\\Documents\\Github\\airi-clean-pr\\packages\\stage-ui\\src\\components\\scenarios\\dialogs\\model-selector\\Live2DReportModal.vue';
const buffer = fs.readFileSync(path);
// Filter out null bytes and other non-ASCII characters that might be causing the "spaces" effect
const clean = Array.from(buffer).filter(b => b !== 0).map(b => String.fromCharCode(b)).join('');
// Strip the BOM if present
const final = clean.replace(/^\uFEFF/, '').replace(/^/, '');
fs.writeFileSync(path, final, 'utf8');
console.log('File cleaned successfully');
