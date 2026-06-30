const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY or VITE_GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}


async function testModel(modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `A modern professional office backdrop. photorealistic, cinematic lighting.` }],
      },
    ],
  };

  if (modelName.includes('imagen')) {
    // Imagen API structure might differ, but let's test if generateContent or generateImages works
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`MODEL ${modelName}: status ${res.status}`);
    console.log(text.slice(0, 500));
  } catch (err) {
    console.error(`MODEL ${modelName} error:`, err);
  }
}

async function run() {
  await testModel('gemini-2.5-flash-image');
  await testModel('imagen-3.0-generate-002');
}

run();
