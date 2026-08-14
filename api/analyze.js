export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY non configurata su Vercel."
      });
    }

    const {
      image,
      marketplace = "Vinted",
      goal = "Equilibrato"
    } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Immagine mancante o non valida."
      });
    }

    const match = image.match(
      /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Formato immagine non valido. Usa JPG, PNG o WEBP."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `
Sei un esperto di reselling di moda e streetwear.

Analizza attentamente la foto.

Restituisci esclusivamente JSON valido:

{
  "brand": "",
  "model": "",
  "category": "",
  "color": "",
  "size": "",
  "condition": "",
  "confidence": 0,
  "estimated_price_eur": 0,
  "quick_sale_price_eur": 0,
  "estimated_days": "",
  "title": "",
  "description": "",
  "hashtags": []
}

Non inventare dettagli non visibili.
Se un dato non è identificabile usa "Non identificato".
confidence deve essere compreso tra 0 e 1.
I prezzi devono essere stime prudenti del mercato europeo dell'usato.

Marketplace: ${marketplace}
Strategia: ${goal}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Api-Revision": "2026-05-20"
        },
        body: JSON.stringify({
          model: "gemini-3.6-flash",
          input: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              data: base64Data,
              mime_type: mimeType
            }
          ],
          response_format: {
            type: "json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini ha rifiutato la richiesta."
      });
    }

    const text =
      data?.steps
        ?.filter(step => step.type === "model_output")
        ?.flatMap(step => step.content || [])
        ?.find(content => content.type === "text")
        ?.text || "";

    if (!text) {
      return res.status(500).json({
        error: "Gemini non ha restituito un risultato."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      console.error("Invalid Gemini JSON:", text);

      return res.status(500).json({
        error: "La risposta Gemini non è nel formato previsto."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      error: error?.message || "Errore durante l'analisi AI."
    });
  }
}
