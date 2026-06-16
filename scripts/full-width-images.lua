-- Lua filter: set all images to 100% page width (preserving aspect ratio)
function Image(el)
  el.attr.attributes["width"] = "100%"
  return el
end
