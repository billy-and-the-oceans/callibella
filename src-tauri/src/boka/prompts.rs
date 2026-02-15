pub fn language_name(code: &str) -> &str {
    match code {
        "en" => "English",
        "fr" => "French",
        "es" => "Spanish",
        "de" => "German",
        "it" => "Italian",
        "pt" => "Portuguese",
        "ja" | "jp" => "Japanese",
        "ko" => "Korean",
        "zh" | "cn" => "Mandarin Chinese",
        "nl" => "Dutch",
        "sv" => "Swedish",
        "ru" => "Russian",
        "ar" => "Arabic",
        "hi" => "Hindi",
        "tr" => "Turkish",
        "pl" => "Polish",
        "en-gb" => "British English",
        "th" => "Thai",
        "vi" => "Vietnamese",
        "id" => "Indonesian",
        "ms" => "Malay",
        "uk" => "Ukrainian",
        "cs" => "Czech",
        "ro" => "Romanian",
        "el" => "Greek",
        "he" | "iw" => "Hebrew",
        "da" => "Danish",
        "fi" => "Finnish",
        "no" | "nb" => "Norwegian",
        "hu" => "Hungarian",
        "mn" => "Mongolian",
        "ka" => "Georgian",
        "sw" => "Swahili",
        "tl" => "Tagalog",
        // If someone types the full language name, pass it through
        _ => code,
    }
}

pub fn base_translation_system_prompt(target_language: &str, source_language: Option<&str>, adult_mode: bool) -> String {
    let lang_name = language_name(target_language);
    let register_note = if adult_mode {
        "Keep tone authentic; slang/profanity is allowed if it's in the source."
    } else {
        "Keep it family-friendly. Colloquial is fine, vulgar is not."
    };

    let source_note = match source_language {
        Some(src) => format!("The source text is written in {}. ", language_name(src)),
        None => String::new(),
    };

    format!(
        r#"You are a {lang_name} translation expert. {source_note}Translate the requested segment into {lang_name}.

Guidelines:
- Translate naturally, not literally.
- Preserve meaning, tone, and speaker intent.
- Keep punctuation and sentence boundaries natural.
- Return ONLY the translated text for the segment. No quotes, no markdown, no commentary.

Tone note:
{register_note}"#,
        lang_name = lang_name,
        source_note = source_note,
        register_note = register_note,
    )
}

pub fn span_planning_system_prompt(target_language: &str, _source_language: Option<&str>, dense_spans: bool) -> String {
    let lang_name = language_name(target_language);
    let span_density_instruction = if dense_spans {
        "Aim for 3-5 swappable spans."
    } else {
        "Aim for 1-2 swappable spans."
    };

    format!(
        r#"You are a {lang_name} language expert creating interactive learning materials.

You will receive a single translated segment in {lang_name}. Your job is to turn it into an interactive block with static text + swappable spans.

Output format:
Return a JSON array with EXACTLY one block in this schema:

[
  {{
    \"id\": \"b1\",
    \"segments\": [
      {{ \"type\": \"static\", \"text\": \"...\" }},
      {{ \"type\": \"swappable\", \"id\": \"s1\", \"variants\": [
        {{ \"text\": \"...\", \"register\": \"neutral\", \"note\": \"\", \"difficulty\": 2 }}
      ]}}
    ]
  }}
]

Rules:
- The block must preserve the meaning of the segment.
- Each swappable span MUST include a neutral variant that matches the exact text from the segment.
- Variants arrays should contain ONLY the neutral variant for now (register: \"neutral\").
- {span_density_instruction}

Return ONLY the JSON array. No markdown."#,
        lang_name = lang_name,
        span_density_instruction = span_density_instruction,
    )
}

pub fn span_variants_system_prompt(target_language: &str, _source_language: Option<&str>, adult_mode: bool) -> String {
    let lang_name = language_name(target_language);

    let register_instruction = if adult_mode {
        r#"Generate variants across the FULL register spectrum:
- formal
- literary
- neutral
- casual
- colloquial
- vulgar"#
    } else {
        r#"Generate variants across these registers:
- formal
- literary
- neutral
- casual
- colloquial

Keep all variants family-friendly."#
    };

    format!(
        r#"You are a {lang_name} language expert. You will be given a segment context and an anchor phrase within it.

Return a JSON array of variants. Each item:
{{ \"text\": \"...\", \"register\": \"neutral|formal|literary|casual|colloquial|vulgar\", \"note\": \"English learner note\", \"difficulty\": 1-5 }}

Rules:
- The FIRST variant MUST be the most natural neutral phrasing.
- Keep meaning consistent with the segment context.
- Aim for 2-4 variants total.

Register guidance:
{register_instruction}

Return ONLY the JSON array. No markdown."#,
        lang_name = lang_name,
        register_instruction = register_instruction,
    )
}
