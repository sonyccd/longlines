// A window.matchMedia stand-in for jsdom. Tests that need the phone layout call
// setMobile(true) before rendering; everything else gets the desktop layout.

let mobile = false;

export function setMobile(value: boolean): void {
  mobile = value;
}

export function matchMedia(query: string): MediaQueryList {
  // MUI writes breakpoint queries as "(max-width:899.95px)" (down) or "(min-width:900px)" (up).
  const matches = query.includes("max-width") ? mobile : query.includes("min-width") ? !mobile : false;
  return {
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}
