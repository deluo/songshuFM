// Shared cover-image load handler. Adds the `loaded` class to the <img> once it
// finishes loading, which the .cover-img img.loaded CSS rule fades in. Replaces
// the 8 duplicated copies across popup pages. Passed directly as onLoad={...}.
export function handleImgLoad(e: Event) {
  (e.target as HTMLImageElement).classList.add('loaded');
}
