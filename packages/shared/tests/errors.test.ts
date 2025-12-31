import { describe, expect, it } from "@codeforbreakfast/bun-test-effect"
import { Schema, Effect } from "effect"
import { ParseError, SessionError, PieceNotFound } from "../src/errors.js"
import { PieceId } from "../src/domain.js"

describe("error types", () => {
  describe("ParseError", () => {
    it("creates with MalformedXml reason", () => {
      const error = new ParseError({
        reason: "MalformedXml",
        details: "Unexpected closing tag",
        filePath: "/pieces/bad.xml",
      })

      expect(error._tag).toBe("ParseError")
      expect(error.reason).toBe("MalformedXml")
      expect(error.details).toBe("Unexpected closing tag")
    })

    it("is serializable", () => {
      const error = new ParseError({
        reason: "NoPianoPart",
        details: "No piano part found in score",
        filePath: "/pieces/orchestra.xml",
      })

      const encoded = Schema.encodeSync(ParseError)(error)
      const decoded = Schema.decodeSync(ParseError)(encoded)

      expect(decoded._tag).toBe("ParseError")
      expect(decoded.reason).toBe("NoPianoPart")
    })
  })

  describe("SessionError", () => {
    it("creates with NotStarted reason", () => {
      const error = new SessionError({ reason: "NotStarted" })
      expect(error._tag).toBe("SessionError")
      expect(error.reason).toBe("NotStarted")
    })

    it("creates with AlreadyActive reason", () => {
      const error = new SessionError({ reason: "AlreadyActive" })
      expect(error.reason).toBe("AlreadyActive")
    })

    it("creates with InvalidState reason", () => {
      const error = new SessionError({ reason: "InvalidState" })
      expect(error.reason).toBe("InvalidState")
    })
  })

  describe("PieceNotFound", () => {
    it("creates with piece id", () => {
      const error = new PieceNotFound({ id: "missing-piece" as PieceId })
      expect(error._tag).toBe("PieceNotFound")
      expect(error.id).toBe("missing-piece")
    })
  })
})
