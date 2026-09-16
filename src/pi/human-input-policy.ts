import type { Role } from "../skill-router.ts";
import { askToolForRole, type AskToolKind } from "./ask-user-batch.ts";

/** Which child question tool the Pi runner may register for this request. */
export function humanInputToolForRequest(request: {
  role: Role;
  allowHumanInput?: boolean;
}): AskToolKind | null {
  return request.allowHumanInput === false ? null : askToolForRole(request.role);
}
