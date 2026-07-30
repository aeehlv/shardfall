import { ObjectId } from "mongodb";
import { getDb } from "./db";

/** Read-side view of a better-auth `user` doc (mongodbAdapter, singular collection). */
export interface AuthUserInfo {
  email: string | null;
  verified: boolean;
}

/** userId → {email, verified} from better-auth's `user` collection, one batched query.
 *  Best-effort: any lookup failure just yields an empty map — callers show nulls. */
export async function authUsersById(userIds: string[]): Promise<Map<string, AuthUserInfo>> {
  const out = new Map<string, AuthUserInfo>();
  const ids = userIds.filter((id) => ObjectId.isValid(id));
  if (!ids.length) return out;
  try {
    const users = await (await getDb())
      .collection("user")
      .find(
        { _id: { $in: ids.map((id) => new ObjectId(id)) } },
        { projection: { email: 1, emailVerified: 1 } },
      )
      .toArray();
    for (const u of users) {
      const { email, emailVerified } = u as { email?: unknown; emailVerified?: unknown };
      out.set(String(u._id), {
        email: typeof email === "string" ? email : null,
        verified: emailVerified === true,
      });
    }
  } catch {
    // fall through — callers render email as null / verified as false
  }
  return out;
}
