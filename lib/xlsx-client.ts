// Lazily load SheetJS (xlsx) on the client.
//
// SheetJS is a large (~400KB) library and its parse/build helpers
// (`read`, `sheet_to_json`, `json_to_sheet`, `writeFile`) run synchronously on
// the main thread. Importing it statically pulls it into the initial client
// bundle, and calling it directly inside a click handler blocks the event
// handler long enough to hurt INP.
//
// Loading it on demand keeps it out of the initial bundle and moves the heavy
// work into a task that runs AFTER the click's synchronous handler returns, so
// the interaction stays responsive. The module promise is cached so repeated
// actions don't re-download or re-evaluate it.
let xlsxPromise: Promise<typeof import('xlsx')> | null = null

export function loadXlsx(): Promise<typeof import('xlsx')> {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx')
  }
  return xlsxPromise
}
