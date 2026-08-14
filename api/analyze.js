export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY non configurata su Vercel."
      });
    }

    const { image, marketplace = "Vinted", goal = "Equilibrato" } =
      req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Immagine mancante o non valida."
      });
    }

    // Verifica che l'immagine sia una Data URL valida
    const match = image.match(
      /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error:
          "Formato immagine non valido. Usa JPG, PNG o WEBP."
      });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Ricostruisce una Data URL pulita
    const cleanImage = `data:${mimeType};base64,${base64Data}`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `
Sei un esperto di reselling di moda e streetwear.

Analizza attentamente l'immagine.

Restituisci esclusivamente un JSON valido, senza markdown e senza testo aggiuntivo.

Struttura obbligatoria:

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

Regole:
- Non inventare caratteristiche che non puoi vedere.
- Se un dato non è leggibile usa "Non identificato".
- La confidence deve essere un numero tra 0 e 1.
- I prezzi devono essere prudenti e indicativi del mercato europeo dell'usato.
- La condizione deve basarsi esclusivamente su ciò che è visibile.
- Crea un titolo adatto al marketplace.
- Crea una descrizione pronta per la pubblicazione.
- Gli hashtag devono essere un array di stringhe.

Marketplace: ${marketplace}
Strategia: ${goal}
`
                },
                {
                  type: "input_image",
                  image_url: cleanImage
                }
              ]
            }
          ],
          max_output_tokens: 1200
        })
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OpenAI error:", data);

      return res.status(openaiResponse.status).json({
        error:
          data?.error?.message ||
          "OpenAI ha rifiutato la richiesta."
      });
    }

    const text =
      data.output
        ?.flatMap((item) => item.content || [])
        ?.find((part) => part.type === "output_text")
        ?.text || "";

    if (!text) {
      return res.status(500).json({
        error: "OpenAI non ha restituito un risultato."
      });
    }

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("JSON parse error:", cleaned);

      return res.status(500).json({
        error: "La risposta AI non è nel formato previsto."
      });
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Analyze error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Errore imprevisto durante l'analisi AI."
    });
  }
}
