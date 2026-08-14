/**
 * Minimal JSON-Schema -> TypeBox converter.
 *
 * Pi's `defineTool` requires `parameters` to be a TypeBox `TSchema`, not a plain
 * JSON schema object (verified against pi-coding-agent 0.84.2:
 * `ToolDefinition<TParams extends TSchema>`). Workflow code stays Pi-free by
 * describing result tools as plain JSON schema; this converts at the boundary.
 *
 * Supports only what result tools need: object, string (+enum), number, integer,
 * boolean, array, required/optional. Anything else throws loudly rather than
 * producing a schema the provider will silently reject.
 */

import { Type, type TSchema } from "typebox";

export interface JsonSchemaNode {
  type?: string;
  enum?: string[];
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
}

export function toTypeBox(node: JsonSchemaNode, path = "$"): TSchema {
  const options = node.description ? { description: node.description } : {};

  if (node.enum) {
    if (node.enum.length === 0) throw new Error(`${path}: empty enum`);
    return Type.Union(
      node.enum.map((v) => Type.Literal(v)),
      options,
    );
  }

  switch (node.type) {
    case "string":
      return Type.String(options);
    case "number":
      return Type.Number(options);
    case "integer":
      return Type.Integer(options);
    case "boolean":
      return Type.Boolean(options);
    case "array": {
      if (!node.items) throw new Error(`${path}: array without items`);
      return Type.Array(toTypeBox(node.items, `${path}[]`), options);
    }
    case "object": {
      const required = new Set(node.required ?? []);
      const props: Record<string, TSchema> = {};
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        const converted = toTypeBox(child, `${path}.${key}`);
        props[key] = required.has(key) ? converted : Type.Optional(converted);
      }
      return Type.Object(props, options);
    }
    default:
      throw new Error(`${path}: unsupported JSON schema type '${node.type}'`);
  }
}
