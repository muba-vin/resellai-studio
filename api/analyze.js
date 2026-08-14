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

Analizza attentamente la foto dell'articolo.

Non inventare informazioni che non sono visibili.
Se un'informazione non può essere determinata dalla foto, usa "Non identificato".

Restituisci un JSON conforme esattamente allo schema richiesto.

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
            type: "text",
            mime_type: "application/json",
            schema: {
              type: "object",
              properties: {
                brand: { type: "string" },
                model: { type: "string" },
                category: { type: "string" },
                color: { type: "string" },
                size: { type: "string" },
                condition: { type: "string" },
                confidence: { type: "number" },
                estimated_price_eur: { type: "number" },
                quick_sale_price_eur: { type: "number" },
                estimated_days: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                hashtags: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: [
                "brand",
                "model",
                "category",
                "color",
                "size",
                "condition",
                "confidence",
                "estimated_price_eur",
                "quick_sale_price_eur",
                "estimated_days",
                "title",
                "description",
                "hashtags"
              ]
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini ha rifiutato la richiesta."
      });
    }

    const text =
      data?.output_text ||
      data?.steps
        ?.flatMap(step => step.content || [])
        ?.find(content => content.type === "text")
        ?.text ||
      "";

    if (!text) {
      console.error("Gemini response:", data);

      return res.status(500).json({
        error: "Gemini non ha restituito un risultato."
      });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch (error) {
      console.error("Invalid JSON from Gemini:", text);

      return res.status(500).json({
        error: "La risposta Gemini non è nel formato previsto."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Errore durante l'analisi AI."
    });
  }
}
