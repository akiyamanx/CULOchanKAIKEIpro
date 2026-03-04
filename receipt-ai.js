// receipt-ai.js
// このファイルはGemini AIを使って複数レシート画像を解析し、
// 構造化JSONデータを返す機能を提供する（Phase3: AIフル解析方式）
// v6.0 - box_2d+OpenCV廃止、Gemini直接JSON解析、gemini-2.5-flash-lite対応

'use strict';

// v6.0: Phase3 AIフル解析方式
// 旧方式: Gemini(box_2d座標) → OpenCV(切り抜き) → Gemini(OCR) ← 精度問題あり
// 新方式: Gemini一発で「何枚あるか」+「各レシートの内容」を直接JSON返却
// メリット: 横向き・斜め・密集でも読める、OpenCV不要、コードが大幅シンプル化

const ReceiptAI = {

  // v6.0: モデル変更 gemini-2.0-flash → gemini-2.5-flash-lite
  MODEL: 'gemini-2.5-flash-lite-preview-06-17',
  API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models/',

  // v6.0: responseSchema定義（構造化出力で確実にJSON取得）
  RESPONSE_SCHEMA: {
    type: 'object',
    properties: {
      receipts: {
        type: 'array',
        description: '画像内に存在する各レシートのデータ配列',
        items: {
          type: 'object',
          properties: {
            store_name: {
              type: 'string',
              description: '店名・会社名'
            },
            date: {
              type: 'string',
              description: '取引日（YYYY-MM-DD形式、不明な場合は空文字）'
            },
            total_amount: {
              type: 'integer',
              description: '合計金額（税込、数値のみ、円記号なし）'
            },
            category: {
              type: 'string',
              description: '支出カテゴリ（駐車場/燃料費/消耗品/食費/交通費/その他）',
              enum: ['駐車場', '燃料費', '消耗品', '食費', '交通費', 'その他']
            },
            is_parking: {
              type: 'boolean',
              description: 'これが駐車場レシートかどうか'
            },
            tax_amount: {
              type: 'integer',
              description: '消費税額（不明な場合は0）'
            },
            items_summary: {
              type: 'string',
              description: '主な購入品目の要約（1〜2行程度）'
            },
            confidence: {
              type: 'string',
              description: '読み取り信頼度',
              enum: ['high', 'medium', 'low']
            }
          },
          required: ['store_name', 'date', 'total_amount', 'category', 'is_parking']
        }
      },
      total_count: {
        type: 'integer',
        description: '画像内のレシート総枚数'
      },
      notes: {
        type: 'string',
        description: '読み取り時の注意事項や補足（任意）'
      }
    },
    required: ['receipts', 'total_count']
  },

  // v6.0: メインプロンプト（切り抜き不要、直接内容解析）
  buildPrompt() {
    return `あなたは日本語レシート・領収書の専門解析AIです。

【重要な指示】
この画像には複数枚のレシート・領収書が含まれている可能性があります。
画像内に見えるレシートを1枚ずつ個別に読み取り、すべてのレシートのデータを返してください。

【読み取りルール】
- 斜めになっていても、横向きでも、重なっていても読み取ってください
- 日本語・英語どちらの表記にも対応してください
- 金額は税込合計金額を優先して取得してください
- 日付は「2026年3月4日」「26.03.04」「2026/3/4」など様々な形式をYYYY-MM-DDに変換してください
- レシートが見当たらない・読めない場合でも配列に含め、confidence: "low"にしてください

【カテゴリ判定基準】
- 駐車場: Times/タイムズ/パーク/駐車/PARKING等
- 燃料費: ENEOS/出光/コスモ/エネオス/石油/ガソリン等
- 消耗品: カー用品/オートバックス/ホームセンター等
- 食費: レストラン/コンビニ/スーパー等
- 交通費: 電車/バス/新幹線/高速道路等
- その他: 上記以外`;
  },

  // v6.0: APIキー取得
  getApiKey() {
    if (typeof window !== 'undefined' && window.GEMINI_API_KEY) {
      return window.GEMINI_API_KEY;
    }
    // IndexedDBやlocalStorageからの取得（既存の仕組みと連携）
    return null;
  },

  // v6.0: 画像をbase64に変換
  async imageToBase64(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // data:image/jpeg;base64,XXXXX → XXXXXのみ取得
        const base64 = e.target.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  },

  // v6.0: EXIF回転を考慮して画像をCanvasに描画しbase64取得
  async imageToBase64WithRotation(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(imageFile);
      img.onload = () => {
        // EXIFを無視してそのまま送る（Geminiが読めるので問題なし）
        // 将来的にEXIF対応が必要な場合はここで回転補正
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        // quality 0.85でJPEG圧縮（APIの20MB制限対策）
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = url;
    });
  },

  // v6.0: メイン解析関数（外部から呼ぶエントリポイント）
  async analyzeReceipts(imageFile, apiKey) {
    try {
      const key = apiKey || this.getApiKey();
      if (!key) throw new Error('APIキーが設定されていません');

      // 画像をbase64に変換（EXIF考慮）
      const base64Image = await this.imageToBase64WithRotation(imageFile);
      const mimeType = imageFile.type || 'image/jpeg';

      // v6.0: responseSchemaを使った構造化出力リクエスト
      const requestBody = {
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image
              }
            },
            {
              text: this.buildPrompt()
            }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.RESPONSE_SCHEMA,
          temperature: 0.1,  // v6.0: 低温度で安定したJSON出力
          maxOutputTokens: 2048
        }
      };

      const url = `${this.API_BASE}${this.MODEL}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
      }

      const data = await response.json();

      // v6.0: レスポンス解析
      const result = this._parseResponse(data);
      return result;

    } catch (err) {
      console.error('ReceiptAI.analyzeReceipts error:', err);
      return {
        success: false,
        error: err.message,
        receipts: [],
        total_count: 0
      };
    }
  },

  // v6.0: APIレスポンスを解析してデータ抽出
  _parseResponse(data) {
    try {
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('APIからのレスポンスが空です');
      }

      const candidate = data.candidates[0];
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('セーフティフィルターによりブロックされました');
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) throw new Error('テキスト部分が取得できません');

      // responseMimeType: application/jsonなのでそのままparse
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // フォールバック: JSONブロックを取り出す
        const match = text.match(/```json\s*([\s\S]+?)\s*```/) ||
                      text.match(/(\{[\s\S]+\})/);
        if (match) {
          parsed = JSON.parse(match[1]);
        } else {
          throw new Error('JSONパースに失敗: ' + text.substring(0, 100));
        }
      }

      // v6.0: データ正規化
      const receipts = (parsed.receipts || []).map((r, i) => ({
        id: `receipt_${Date.now()}_${i}`,
        store_name: r.store_name || '不明',
        date: this._normalizeDate(r.date),
        total_amount: parseInt(r.total_amount) || 0,
        category: r.category || 'その他',
        is_parking: r.is_parking || false,
        tax_amount: parseInt(r.tax_amount) || 0,
        items_summary: r.items_summary || '',
        confidence: r.confidence || 'medium',
        // v6.0: 切り抜き画像なし（元画像サムネで代用）
        cropped_image: null
      }));

      return {
        success: true,
        receipts: receipts,
        total_count: parsed.total_count || receipts.length,
        notes: parsed.notes || ''
      };

    } catch (err) {
      console.error('ReceiptAI._parseResponse error:', err);
      return {
        success: false,
        error: err.message,
        receipts: [],
        total_count: 0
      };
    }
  },

  // v6.0: 日付正規化（様々な形式→YYYY-MM-DD）
  _normalizeDate(dateStr) {
    if (!dateStr) return '';
    // 既にYYYY-MM-DD形式
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // 年省略形 YY-MM-DD or YY/MM/DD
    const shortMatch = dateStr.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (shortMatch) {
      return `20${shortMatch[1]}-${shortMatch[2]}-${shortMatch[3]}`;
    }
    // YYYY/MM/DD or YYYY年MM月DD日
    const longMatch = dateStr.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
    if (longMatch) {
      const m = longMatch[2].padStart(2, '0');
      const d = longMatch[3].padStart(2, '0');
      return `${longMatch[1]}-${m}-${d}`;
    }
    return dateStr;
  },

  // v6.0: 単一レシート再解析（詳細品目取得用）
  async analyzeReceiptDetail(imageFile, apiKey, receiptIndex) {
    // 将来拡張: 特定のレシートだけ詳細に再解析する機能
    // 現バージョンでは通常解析と同じ
    return await this.analyzeReceipts(imageFile, apiKey);
  }

};

// v6.0: グローバルエクスポート
if (typeof window !== 'undefined') {
  window.ReceiptAI = ReceiptAI;
}
if (typeof module !== 'undefined') {
  module.exports = ReceiptAI;
}
