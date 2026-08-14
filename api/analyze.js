export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY non configurata."
      });
    }

    const {
      image,
      marketplace = "Vinted",
      goal = "Equilibrato"
    } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "Immagine mancante."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
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
Analizza questa foto come esperto di reselling.

Restituisci SOLO JSON valido con questa struttura:

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
- Non inventare dettagli non visibili.
- Se non sei sicuro usa "Non identificato".
- Valuta la condizione solo sulla base della foto.
- Il prezzo deve essere una stima prudente del mercato europeo dell'usato.
- Marketplace: ${marketplace}
- Strategia: ${goal}
`
                },
                {
                  type: "input_image",
                  image_url: image
                }
              ]
            }
          ],
          max_output_tokens: 1200
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Errore durante l'analisi AI."
      });
    }

    const text =
      data.output
        ?.flatMap(item => item.content || [])
        .find(part => part.type === "output_text")
        ?.text || "";

    const cleaned = text
      .replace(/^```json/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Analisi AI non riuscita."
    });
  }
}
