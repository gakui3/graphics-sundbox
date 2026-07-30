const cache = new Map();

async function fetchText(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((res) => res.text()));
  }
  return cache.get(url);
}

// three.js が自前で展開するチャンクは触らない
const THREE_CHUNKS = new Set(["tonemapping_fragment", "colorspace_fragment", "common"]);

/** #include <name> を shaders/name.glsl で展開しながら読み込む */
export async function loadShader(url) {
  const src = await fetchText(url);
  const includes = [...src.matchAll(/#include\s+<(\w+)>/g)];
  let out = src;
  for (const [directive, name] of includes) {
    if (THREE_CHUNKS.has(name)) continue;
    const chunk = await fetchText(`./shaders/${name}.glsl`);
    out = out.replace(directive, chunk);
  }
  return out;
}
