// Opens an application's email as a new message in macOS Mail: addressed, with its subject, body
// and attachments, waiting for the person to press Send. Values go to osascript as arguments,
// never into the script's text. No Herdr imports, so Node can test it.
import { parseEmail, splitAddress } from "./model.js";

export const MAIL_SCRIPT = [
  "on run argv",
  "set toName to item 1 of argv",
  "set toAddress to item 2 of argv",
  "set fromValue to item 3 of argv",
  "set theSubject to item 4 of argv",
  "set theBody to item 5 of argv",
  "tell application \"Mail\"",
  "set msg to make new outgoing message with properties {subject:theSubject, content:theBody & return & return, visible:true}",
  "tell msg",
  "make new to recipient at end of to recipients with properties {name:toName, address:toAddress}",
  "if fromValue is not \"\" then",
  "try",
  "set sender to fromValue",
  "end try",
  "end if",
  "end tell",
  "repeat with i from 6 to count of argv",
  "tell content of msg to make new attachment with properties {file name:(POSIX file (item i of argv))} at after the last paragraph",
  "end repeat",
  "activate",
  "end tell",
  "end run",
];

// osascript's arguments for an email.md in `folder`. Throws when it has no address or names an
// attachment that is not there, so nothing half-made opens.
export function composeArgs(emailMd, folder, files, fallbackTo = "") {
  const email = parseEmail(emailMd);
  const to = splitAddress(email.to || fallbackTo);
  if (!to.address) throw new Error("email.md has no To: address");
  const missing = email.attachments.filter((name) => !files.includes(name));
  if (missing.length) throw new Error(`attachments not in the folder yet: ${missing.join(", ")}`);
  return [
    ...MAIL_SCRIPT.flatMap((line) => ["-e", line]),
    to.name, to.address, email.from, email.subject, email.body,
    ...email.attachments.map((name) => `${folder}/${name}`),
  ];
}
