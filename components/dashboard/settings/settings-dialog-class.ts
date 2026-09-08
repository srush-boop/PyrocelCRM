// Shared sizing for Settings configuration dialogs (add/edit forms).
//
// - Enlarges the default dialog (the base ui/dialog caps at sm:max-w-lg).
// - `resize` + `overflow-auto` make the dialog user-stretchable: drag the
//   bottom-right corner to grow or shrink it.
// - Width/height are capped to the viewport so it never overflows the screen.
//
// twMerge (via cn) drops the base max-w / sm:max-w / w-full so these win.
export const SETTINGS_DIALOG_CLASS =
  'w-[42rem] max-w-[95vw] sm:max-w-[95vw] max-h-[90vh] resize overflow-auto'
