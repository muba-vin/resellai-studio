
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
      images,
      userDescription = "",
      marketplace = "Vinted",
      goal = "Equilibrato"
    } = req.body || {};

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: "Nessuna foto ricevuta."
      });
    }

    if (images.length > 8) {
      return res.status(400).json({
        error: "Puoi caricare massimo 8 foto."
      });
    }

    const imageParts = [];

    for (const image of images) {
      if (typeof image !== "string") continue;

      const match = image.match(
        /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/
      );

      if (!match) {
        return res.status(400).json({
          error: "Una delle immagini non è in un formato valido. Usa JPG, PNG o WEBP."
        });
      }

      imageParts.push({
        type: "image",
        data: match[2],
        mime_type: match[1]
      });
    }

    if (imageParts.length === 0) {
      return res.status(400).json({
        error: "Nessuna immagine valida ricevuta."
      });
    }

    const prompt = `
Sei un esperto professionista di reselling e copywriting per marketplace di seconda mano.

Devi analizzare TUTTE le foto dell'articolo insieme e creare un annuncio ottimizzato per la vendita.

Marketplace principale: ${marketplace}
Strategia prezzo: ${goal}

Informazioni aggiuntive fornite dal venditore:
${userDescription || "Nessuna informazione aggiuntiva fornita."}

Usa sia ciò che vedi nelle fotografie sia le informazioni fornite dal venditore.

IMPORTANTE:
- Non inventare caratteristiche che non puoi verificare.
- Se una caratteristica non è visibile e non è stata indicata dal venditore, usa "Non identificato".
- Se sono visibili difetti, macchie, usura o imperfezioni, indicane la presenza in modo trasparente.
- Non dichiarare autenticità se non può essere verificata.
- Non inventare taglia, materiale, modello o colore.
- La descrizione deve essere piacevole, naturale e orientata alla vendita.
- Usa alcune emoji pertinenti, ma senza esagerare.
- Il testo deve sembrare scritto da un venditore reale, non da un robot.
- Per Vinted privilegia un titolo chiaro, ricercabile e breve.
- Evita keyword stuffing.
- Inserisci nella descrizione le informazioni realmente utili all'acquirente.
- Se il venditore ha fornito informazioni importanti, integrale naturalmente nel testo.
- I prezzi devono essere prudenti e indicativi del mercato dell'usato europeo.
- La stima dei giorni di vendita deve essere realistica.
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
            ...imageParts
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
    } catch {
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
