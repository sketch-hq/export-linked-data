const { getSelectedDocument, Style } = require('sketch')
const { message } = require('sketch/ui')

function isLayerGroup(tbc) {
  return 'type' in tbc && tbc.type == 'Group'
}

const toData = (layer) => {
  switch (layer.type) {
    // text layers use the value
    case 'Text':
      return layer.text

    // symbol instances can have override values
    case 'SymbolInstance':
    case 'SymbolMaster':
      // ensure overrides for nested symbols won't be processed before the
      // actual symbol override and filter out any override values that cannot
      // be used with data
      let supportedProperties = ['symbolID', 'stringValue', 'image']
      let overrides = layer.overrides
        .sort((a, b) => a.path.localeCompare(b.path))
        .filter((val) => supportedProperties.includes(val.property))

      var data = {}
      var dataGroupByPath = { '': data }
      var hasValues = false

      for (const o of overrides) {
        let pathComponents = o.path.split('/')
        pathComponents.pop()
        let parentPath = pathComponents.join('/')

        if (o.property === 'symbolID') {
          dataGroupByPath[o.path] = {}
          dataGroupByPath[parentPath][o.affectedLayer.name] =
            dataGroupByPath[o.path]
          continue
        }

        dataGroupByPath[parentPath][o.affectedLayer.name] =
          o.property === 'image' ? '/path/to/image.png' : o.value
        hasValues = true
      }
      // We need to remove the nodes that don't have any values
      data = removeEmptyNodes(data)

      return hasValues ? data : undefined

    // other layers can have image fills, in case of multiple image fills only
    // the last one is used as override value
    default:
      let hasImageFill = layer.style?.fills.reduce((prev, curr) => {
        if (curr.type !== Style.FillType.Pattern) return prev
        return true
      }, false)

      if (!hasImageFill) break
      return '/path/to/image.png' // actual image not exported, placeholder instead
  }
  return undefined
}

const walk = (layer, extract, initialValue) => {
  if (!isLayerGroup(layer)) {
    return extract(layer)
  }

  var value = initialValue
  for (const l of Array.from(layer.layers).reverse()) {
    // layer groups can only create nested data objects, not values
    let v = isLayerGroup(l) ? walk(l.layers, extract, undefined) : extract(l)
    if (v === undefined) continue
    value = { ...value, [l.name]: v }
  }
  return value
}

let doc = getSelectedDocument()

if (doc.selectedLayers.length !== 1) {
  message('☝️ Select exactly one layer group to create data set.')
  return
}

let selected = doc.selectedLayers.layers[0]

let data = walk(selected, toData, undefined)

// `data` can be `undefined` if the symbol overrides
// in the selected layer are disabled
if (data === undefined) {
  message('☝️ No symbol overrides found.')
} else {
  // wrap data in array before encoding as JSON because Sketch expects a
  // set of values, not a single object
  let json = JSON.stringify([data], null, 2)

  // use native macOS pasteboard APIs to copy the JSON so it can be easily
  // pasted outside Sketch
  let pasteboard = NSPasteboard.generalPasteboard()
  pasteboard.clearContents()
  pasteboard.setString_forType(json, NSPasteboardTypeString)

  message('📋 Data copied to clipboard.')
}

function removeEmptyNodes(obj) {
  let hasEmptyNodes = false
  Object.entries(obj).forEach(([key, value]) => {
    if (Object.keys(value).length === 0) {
      delete obj[key]
      hasEmptyNodes = true
    } else if (typeof value === 'object') {
      obj[key] = removeEmptyNodes(value)
    }
  })
  return hasEmptyNodes ? removeEmptyNodes(obj) : obj
}
