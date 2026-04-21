const apiKey = process.env.ARK_API_KEY;

if (!apiKey) {
  console.error("ARK_API_KEY is missing");
  process.exit(1);
}

const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/models", {
  method: "GET",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
});

const text = await response.text();

if (!response.ok) {
  console.error(text);
  process.exit(1);
}

const payload = JSON.parse(text);
const models = Array.isArray(payload.data) ? payload.data : [];

for (const model of models) {
  console.log(JSON.stringify({
    id: model.id,
    object: model.object,
    owned_by: model.owned_by,
  }));
}
