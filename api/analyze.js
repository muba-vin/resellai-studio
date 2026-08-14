export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Metodo non consentito."
    });
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

    // -----------------------------
    // VALIDAZIONE IMMAGINI
    // -----------------------------

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

    let totalBase64Length = 0;

    for (let i = 0; i < images.length; i++) {

      const image = images[i];

      if (typeof image !== "string") {
        return res.status(400).json({
          error: `La foto ${i + 1} non è valida.`
        });
      }

      /*
       * Accettiamo JPEG, PNG e WEBP.
       */
      const match = image.match(
        /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/
      );

      if (!match) {
        return res.status(400).json({
          error:
            `La foto ${i + 1} non è in un formato valido. ` +
            "Usa JPG, PNG o WEBP."
        });
      }

      const mimeType = match[1] === "image/jpg"
        ? "image/jpeg"
        : match[1];

      const base64Data = match[2];

      totalBase64Length += base64Data.length;

      imageParts.push({
        type: "image",
        data: base64Data,
        mime_type: mimeType
      });
    }

    /*
     * Evitiamo richieste enormi.
     *
     * Il frontend comprime già le immagini.
     * Questo controllo serve come ulteriore protezione.
     */
    const totalMegabytes =
      totalBase64Length / 1024 / 1024;

    if (totalMegabytes > 8) {
      return res.status(413).json({
        error:
          `Le  immagini sono ancora troppo pesanti ` +
          `(${totalMegabytes.toFixed(1)} MB). ` +
          `Prova con foto più leggere oppure seleziona meno immagini.`
      });
    }

    if (imageParts.length === 0) {
      return res.status(400).json({
        error: "Nessuna immagine valida ricevuta."
      });
    }

    // -----------------------------
    // PROMPT
    // -----------------------------

    const prompt = `
Sei un esperto professionista di reselling,
copywriting e marketplace dell'usato.

Analizza TUTTE le fotografie dell'articolo
insieme.

Non analizzare le foto singolarmente:
considerale come diverse viste dello STESSO prodotto.

Marketplace:
${marketplace}

Strategia prezzo:
${goal}

Informazioni fornite dal venditore:
${userDescription || "Nessuna informazione aggiuntiva."}

OBIETTIVO:

Crea un annuncio realistico, gradevole e ottimizzato
per aumentare le probabilità di vendita.

REGOLE IMPORTANTI:

- Non inventare informazioni.
- Non inventare marca, modello, taglia, colore o materiale.
- Se una caratteristica non è verificabile scrivi "Non identificato".
- Se il venditore ha fornito un'informazione, puoi utilizzarla.
- Individua eventuali difetti visibili.
- Non dichiarare autenticità se non può essere verificata.
- Il titolo deve essere breve e facilmente ricercabile.
- Per Vinted privilegia parole chiave naturali.
- Evita keyword stuffing.
- La descrizione deve sembrare scritta da una persona reale.
- Usa alcune emoji pertinenti.
- Non usare troppe emoji.
- Evidenzia le condizioni dell'articolo.
- Suggerisci un prezzo realistico per il mercato dell'usato europeo.
- Fornisci anche un prezzo leggermente più basso per una vendita rapida.
- La confidenza deve rappresentare quanto è sicura l'identificazione.
- Gli hashtag devono essere pochi e pertinenti.
`;

    // -----------------------------
    // CHIAMATA GEMINI
    // -----------------------------

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

                brand: {
                  type: "string"
                },

                model: {
                  type: "string"
                },

                category: {
                  type: "string"
                },

                color: {
                  type: "string"
                },

                size: {
                  type: "string"
                },

                condition: {
                  type: "string"
                },

                confidence: {
                  type: "number"
                },

                estimated_price_eur: {
                  type: "number"
                },

                quick_sale_price_eur: {
                  type: "number"
                },

                estimated_days: {
                  type: "string"
                },

                title: {
                  type: "string"
                },

                description: {
                  type: "string"
                },

                hashtags: {
                  type: "array",
                  items: {
                    type: "string"
                  }
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

    // -----------------------------
    // LETTURA RISPOSTA
    // -----------------------------

    const rawResponse =
      await response.text();

    let data;

    try {
      data = rawResponse
        ? JSON.parse(rawResponse)
        : {};
    } catch {
      console.error(
        "Risposta Gemini non JSON:",
        rawResponse
      );

      return res.status(502).json({
        error:
          "Gemini ha restituito una risposta non valida."
      });
    }

    // -----------------------------
    // ERRORE GEMINI
    // -----------------------------

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        JSON.stringify(data, null, 2)
      );

      let message =
        data?.error?.message ||
        data?.message ||
        data?.status ||
        null;

      if (!message && data?.error) {
        try {
          message = JSON.stringify(data.error);
        } catch {
          message = String(data.error);
        }
      }

      return res.status(response.status).json({
        error:
          message ||
          `Gemini ha rifiutato la richiesta (HTTP ${response.status}).`
      });
    }

    // -----------------------------
    // ESTRAZIONE TESTO
    // -----------------------------

    let text =
      data?.output_text ||
      "";

    if (!text && Array.isArray(data?.steps)) {

      for (const step of data.steps) {

        if (!Array.isArray(step?.content)) {
          continue;
        }

        for (const content of step.content) {

          if (
            content?.type === "text" &&
            typeof content?.text === "string"
          ) {
            text = content.text;
            break;
          }
        }

        if (text) {
          break;
        }
      }
    }

    if (!text) {

      console.error(
        "Gemini response senza testo:",
        JSON.stringify(data, null, 2)
      );

      return res.status(502).json({
        error:
          "Gemini non ha restituito un risultato testuale."
      });
    }

    // -----------------------------
    // PARSING JSON
    // -----------------------------

    let result;

    try {

      result = JSON.parse(text);

    } catch (parseError) {

      console.error(
        "JSON Gemini non valido:",
        text
      );

      return res.status(502).json({
        error:
          "Gemini ha restituito un risultato " +
          "che non è nel formato previsto."
      });
    }

    // -----------------------------
    // RISPOSTA
    // -----------------------------

    return res.status(200).json(result);

  } catch (error) {

    console.error(
      "Analyze error:",
      error
    );

    let message;

    if (
      error &&
      typeof error.message === "string"
    ) {
      message = error.message;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message =
          "Errore durante l'analisi AI.";
      }
    }

    return res.status(500).json({
      error:
        message ||
        "Errore durante l'analisi AI."
    });
  }
}
