// Just enough XML entity handling for Word documents; adding a dependency for
// five entities is not worth it.
export class XMLParser {
  decode(text) {
    return text
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&amp;/g, '&');
  }
}
