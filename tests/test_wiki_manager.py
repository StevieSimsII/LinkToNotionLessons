import os
import unittest


os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("NOTION_API_KEY", "test")
os.environ.setdefault("NOTION_PARENT_PAGE_ID", "test")
os.environ.setdefault("SECOND_BRAIN_GITHUB_TOKEN", "test")


from markdown_normalizer import normalize_page_markdown


class NormalizePageMarkdownTests(unittest.TestCase):
    def test_converts_h1_metadata_block_to_frontmatter(self) -> None:
        raw = """# Example Lesson

Date: 2026-05-20
Source: https://example.com/lesson
Tags: alpha, beta, gamma

## Overview
Body text.
"""

        normalized = normalize_page_markdown(raw)

        self.assertTrue(normalized.startswith("---\ntitle: \"Example Lesson\"\nsource: \"https://example.com/lesson\"\ndate: \"2026-05-20\"\ntags: [alpha, beta, gamma]\n---"))
        self.assertIn("\n\n## Overview\nBody text.", normalized)
        self.assertNotIn("\nDate: 2026-05-20\n", normalized)
        self.assertNotIn("\nSource: https://example.com/lesson\n", normalized)

    def test_backfills_missing_metadata_from_fallbacks(self) -> None:
        raw = """# Inbox Capture

## Overview
Quick note.
"""

        normalized = normalize_page_markdown(
            raw,
            fallback_source="personal notes",
            fallback_date="2026-05-19",
            fallback_tags=["notes", "inbox"],
        )

        self.assertTrue(normalized.startswith("---\ntitle: \"Inbox Capture\"\nsource: \"personal notes\"\ndate: \"2026-05-19\"\ntags: [notes, inbox]\n---"))
        self.assertIn("\n\n## Overview\nQuick note.", normalized)


if __name__ == "__main__":
    unittest.main()