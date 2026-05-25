function buildCitationSources({
  assets = [],
  customers = [],
  inputs = {},
  signals = [],
  wikiMemory = [],
} = {}) {
  const sources = [];
  for (const source of array(inputs.sources)) {
    pushSource(sources, source, { fallbackLabel: "Founder input source", type: "input" });
  }
  for (const signal of array(signals)) {
    const label = signal.title || signal.source || "Signal source";
    pushSource(sources, signal.source, { fallbackLabel: label, recordID: signal.id, type: "signal" });
    pushSource(sources, objectValue(signal.metadata).source_url, {
      fallbackLabel: label,
      recordID: signal.id,
      type: "signal",
    });
    pushSource(sources, objectValue(signal.metadata).url, {
      fallbackLabel: label,
      recordID: signal.id,
      type: "signal",
    });
    for (const source of array(objectValue(signal.metadata).sources)) {
      pushSource(sources, source, { fallbackLabel: label, recordID: signal.id, type: "signal" });
    }
  }
  for (const asset of array(assets)) {
    const label = asset.name || asset.title || "Asset source";
    pushSource(sources, objectValue(asset.metadata).source_url, {
      fallbackLabel: label,
      recordID: asset.id,
      type: "asset",
    });
    pushSource(sources, objectValue(asset.metadata).url, {
      fallbackLabel: label,
      recordID: asset.id,
      type: "asset",
    });
    for (const source of array(objectValue(asset.metadata).sources)) {
      pushSource(sources, source, { fallbackLabel: label, recordID: asset.id, type: "asset" });
    }
  }
  for (const customer of array(customers)) {
    const label = customer.name || "Customer source";
    for (const source of array(objectValue(customer.profile).sources)) {
      pushSource(sources, source, { fallbackLabel: label, recordID: customer.id, type: "customer" });
    }
  }
  for (const page of array(wikiMemory)) {
    const label = page.title || page.slug || "Memory source";
    for (const source of array(page.sources)) {
      pushSource(sources, source, { fallbackLabel: label, recordID: page.id, type: "memory" });
    }
  }
  return dedupeSources(sources).slice(0, 25);
}

function pushSource(out, value, options = {}) {
  const normalized = normalizeCitationSource(value, options);
  if (normalized) out.push(normalized);
}

function normalizeCitationSource(value, options = {}) {
  if (typeof value === "string") {
    if (!looksLikeURL(value)) return null;
    return {
      label: options.fallbackLabel || value,
      record_id: options.recordID || null,
      type: options.type || "source",
      url: value,
    };
  }
  const object = objectValue(value);
  const url = object.url || object.source_url || object.external_url || object.href;
  if (!looksLikeURL(url)) return null;
  return {
    label: object.label || object.title || object.name || options.fallbackLabel || url,
    record_id: object.record_id || object.id || options.recordID || null,
    type: object.type || options.type || "source",
    url,
  };
}

function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    const key = source.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

function looksLikeURL(value) {
  return /^https?:\/\/[^\s]+$/i.test(String(value || "").trim());
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  buildCitationSources,
  normalizeCitationSource,
};
