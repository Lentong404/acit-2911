import { describe, it } from "node:test";
import assert from "node:assert/strict";
import DOMPurify from 'isomorphic-dompurify';

describe("Security Sanitization", () => {
  
  // ----------------------------------------------------------- XSS Scripts
  describe("XSS Protection", () => {
    it("removes <script> tags entirely", () => {
      const dirty = "Hello <script>alert('hacked')</script> World";
      const clean = DOMPurify.sanitize(dirty);
      
      assert.equal(clean, "Hello  World");
      assert.ok(!clean.includes("<script>"));
    });

    it("removes inline event handlers (onerror, onclick)", () => {
      const dirty = '<img src="x" onerror="alert(1)">';
      const clean = DOMPurify.sanitize(dirty);
      
      // Should keep the tag but strip the malicious attribute
      assert.equal(clean, '<img src="x">');
      assert.ok(!clean.includes("onerror"));
    });

    it("removes javascript: protocols in links", () => {
      const dirty = '<a href="javascript:alert(1)">Click me</a>';
      const clean = DOMPurify.sanitize(dirty);
      
      assert.equal(clean, '<a>Click me</a>');
    });
  });

  // ----------------------------------------------------------- HTML Injection
  describe("HTML & Style Injection", () => {
    it("strips <iframe> tags used for clickjacking", () => {
      const dirty = 'Check this: <iframe src="http://malicious.com"></iframe>';
      
      // We must explicitly forbid iframes as they are sometimes allowed by default
      const clean = DOMPurify.sanitize(dirty, { FORBID_TAGS: ['iframe'] });
      
      // Use trim() because DOMPurify often leaves a trailing space
      assert.equal(clean.trim(), "Check this:");
      assert.ok(!clean.includes("<iframe"), "Should not contain iframe tags");
    });

    it("removes <style> blocks that could break the UI", () => {
      const dirty = "Title <style>body { display: none; }</style>";
      
      // Explicitly forbid style tags to ensure the entire block is removed
      const clean = DOMPurify.sanitize(dirty, { FORBID_TAGS: ['style', 'script', 'iframe'] });
      
      assert.ok(!clean.includes("<style"), "Should remove style blocks");
      assert.equal(clean.trim(), "Title");
    });
    });


  // ----------------------------------------------------------- Data Integrity
  describe("Preserving Safe Content", () => {
    it("does NOT break normal text and safe HTML", () => {
      const safe = "What is <b>Bold</b> and <i>Italic</i>?";
      const clean = DOMPurify.sanitize(safe);
      
      assert.equal(clean, safe);
    });

    it("handles empty strings gracefully", () => {
      assert.equal(DOMPurify.sanitize(""), "");
    });
  });
});
