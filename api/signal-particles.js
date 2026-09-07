const SOURCE_URL = 'https://threeui.com/source-code/predictive-arc.json';
const SOURCE_PATH = 'src/shaders/neuform-isolated/sources/signal-particles.html';

export default async function handler(_req, res) {
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error('Signal Particles source is unavailable.');
    const bundle = await response.json();
    const source = bundle.files?.find(file => file.path === SOURCE_PATH)?.code;
    if (!source) throw new Error('Signal Particles source was not found.');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.status(200).send(source);
  } catch (error) {
    return res.status(502).send(`<!doctype html><title>Signal Particles unavailable</title>`);
  }
}
