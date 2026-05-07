import { describe, it } from "node:test";
import assert from "node:assert/strict";
import DOMPurify from 'isomorphic-dompurify';
import { readFile } from 'fs/promises';

// 1. Load the JSON data manually (Standard for ES Modules)
const testData = JSON.parse(
  await readFile(new URL('unsanitary-data.json', import.meta.url))
);

const securityOptions = { 
  FORBID_TAGS: ['style', 'script', 'iframe'] 
};

describe("Bulk Security Sanitization", () => {
  // 2. Loop through every test case in your JSON file
  testData.forEach((testCase) => {
    
    it(`Case: ${testCase.name}`, () => {
      const clean = DOMPurify.sanitize(testCase.input, securityOptions);
      
      // THE FIX: 
      // 1. replace(/\s+/g, ' ') turns all double/triple spaces into one single space
      // 2. trim() removes any spaces at the very beginning or end
      const normalizedResult = clean.replace(/\s+/g, ' ').trim();
      const normalizedExpected = testCase.expected.replace(/\s+/g, ' ').trim();

      console.log(`\n[${testCase.name.toUpperCase()}]`);
      console.log(` Input:    ${testCase.input}`);
      console.log(` Output:   ${JSON.stringify(normalizedResult)}`);
      console.log(` Expected: ${JSON.stringify(normalizedExpected)}`);

      assert.equal(normalizedResult, normalizedExpected, `Failed on: ${testCase.name}`);
  });

  });
});
