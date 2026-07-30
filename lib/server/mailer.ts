/** Outbound mail via Resend's REST API. With RESEND_API_KEY unset (local dev),
 *  nothing is sent — the link is logged to the server console so flows stay testable. */

/** Minimal branded HTML: inline styles only, no external assets (email clients). */
function magicLinkHtml(url: string): string {
  return `<div style="margin:0;padding:32px 16px;background:#141019;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:440px;margin:0 auto;padding:32px 28px;background:#1d1726;border:1px solid #3a3046;border-radius:10px;text-align:center;">
    <h1 style="margin:0 0 6px;color:#e3a44a;font-size:26px;letter-spacing:2px;">SHARDFALL</h1>
    <p style="margin:0 0 24px;color:#9c93a8;font-size:13px;letter-spacing:1px;">A sign-in link for Kelvarrow</p>
    <p style="margin:0 0 24px;color:#eae3d6;font-size:15px;line-height:1.5;">
      Click the button below to sign in. The link expires after a few minutes and works only once.
    </p>
    <a href="${url}" style="display:inline-block;padding:14px 36px;background:#e3a44a;color:#1d1726;font-size:16px;font-weight:bold;letter-spacing:1px;text-decoration:none;border-radius:6px;">Enter Kelvarrow</a>
    <p style="margin:28px 0 0;color:#9c93a8;font-size:12px;line-height:1.6;">
      If the button does not work, paste this address into your browser:<br />
      <span style="color:#c9bfa8;word-break:break-all;">${url}</span>
    </p>
    <p style="margin:20px 0 0;color:#6d6478;font-size:11px;">
      Didn&rsquo;t request this? You can safely ignore this email.
    </p>
  </div>
</div>`;
}

/** Same dark/gold template, red-accent button — confirms an account deletion. */
function deleteAccountHtml(url: string): string {
  return `<div style="margin:0;padding:32px 16px;background:#141019;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:440px;margin:0 auto;padding:32px 28px;background:#1d1726;border:1px solid #3a3046;border-radius:10px;text-align:center;">
    <h1 style="margin:0 0 6px;color:#e3a44a;font-size:26px;letter-spacing:2px;">SHARDFALL</h1>
    <p style="margin:0 0 24px;color:#9c93a8;font-size:13px;letter-spacing:1px;">Confirm account deletion</p>
    <p style="margin:0 0 24px;color:#eae3d6;font-size:15px;line-height:1.5;">
      You asked to delete your Shardfall account. Clicking the button below erases your duelist
      forever &mdash; collection, decks, wallet, and ledger. This cannot be undone.
    </p>
    <a href="${url}" style="display:inline-block;padding:14px 36px;background:#c9503a;color:#fff2ea;font-size:16px;font-weight:bold;letter-spacing:1px;text-decoration:none;border-radius:6px;">Delete my account</a>
    <p style="margin:28px 0 0;color:#9c93a8;font-size:12px;line-height:1.6;">
      If the button does not work, paste this address into your browser:<br />
      <span style="color:#c9bfa8;word-break:break-all;">${url}</span>
    </p>
    <p style="margin:20px 0 0;color:#6d6478;font-size:11px;">
      Didn&rsquo;t request this? Ignore this email and your account stays untouched.
    </p>
  </div>
</div>`;
}

/** Deliver one email — through Resend when configured, else the link goes to the dev console. */
async function sendMail(
  { logTag, email, url, subject, html }:
  { logTag: string; email: string; url: string; subject: string; html: string },
): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    console.log(`[${logTag}] ${email} -> ${url}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: email,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend refused the ${logTag} mail (${res.status}): ${await res.text()}`);
  }
}

/** Deliver a magic sign-in link. */
export async function sendMagicLinkMail({ email, url }: { email: string; url: string }): Promise<void> {
  await sendMail({
    logTag: "magic-link",
    email,
    url,
    subject: "Your Shardfall sign-in link",
    html: magicLinkHtml(url),
  });
}

/** Deliver the account-deletion confirmation link (better-auth deleteUser verification). */
export async function sendDeleteAccountMail({ email, url }: { email: string; url: string }): Promise<void> {
  await sendMail({
    logTag: "delete-account",
    email,
    url,
    subject: "Confirm account deletion",
    html: deleteAccountHtml(url),
  });
}
