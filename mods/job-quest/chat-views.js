// The party chat: one feed of what the workers post, your replies and the party's events, and a
// box to answer a worker or everyone. Reads the view `v`; touches no files.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { MEMBERS, handlesFor } from "./model.js";
import * as party from "./party.js";
import { note, input } from "./ui.js";

const clock = (iso) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toTimeString().slice(0, 5);
};

const who = (from) => MEMBERS[from] ?? { name: from || "Someone", glyph: "💬", color: "accent" };

function eventLine(t, item, i) {
  return h_flex().id(`jq-chat-${i}`).w_full().justify_center().gap(6).py(2).text_size(10.5).text_color(t.dim)
    .child(div().flex_none().child(clock(item.at)))
    .child(div().min_w(0).truncate().child(item.text));
}

function mine(t, item, i) {
  return v_flex().id(`jq-chat-${i}`).w_full().items_end().gap(2)
    .child(div().text_size(10).text_color(t.dim).child(`You → ${item.to || "the party"} · ${clock(item.at)}`))
    .child(div().max_w(300).px(10).py(6).rounded(10).bg(t.selected).text_size(12).text_color(t.foreground).child(item.text));
}

function theirs(v, t, item, i) {
  const m = who(item.from), job = party.senderOf(item);
  return h_flex().id(`jq-chat-${i}`).w_full().gap(8).items_start()
    .child(div().size(26).flex().flex_none().items_center().justify_center().rounded(13).border_1()
      .border_color(t[m.color] ?? t.accent).bg(t.raised).text_size(13).child(m.glyph))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(h_flex().gap(6).items_center().text_size(10.5)
        .child(div().font_semibold().text_color(t.foreground).child(m.name))
        .when(Boolean(item.appId), (e) => e.child(div().min_w(0).truncate().text_color(t.muted).child(item.appId)))
        .child(div().text_color(t.dim).child(clock(item.at)))
        .child(div().flex_1())
        .child(h_flex().id(`jq-chat-${i}-reply`).px(5).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
          .tooltip(job ? "Reply: puts its @handle in your message" : "Reply: it has finished, so a new one starts to act on your answer")
          .on_click((_e, cx) => v.replyTo(item, cx)).child("Reply"))
        .when(Boolean(job), (e) => e
          .child(h_flex().id(`jq-chat-${i}-watch`).px(5).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
            .on_click(() => v.showJob(job)).child("Watch"))))
      .child(div().px(10).py(6).rounded(10).bg(t.raised).text_size(12).text_color(t.foreground).child(item.text)));
}

// The @ list over the message field: who is running, filtered by what is typed.
function mentionList(v, t, choices) {
  return v_flex().id("jq-chat-mentions").p(4).gap(1).rounded(8).border_1().border_color(t.border).bg(t.background)
    .children(choices.map((c, i) => {
      const m = c.job ? party.describe(c.job) : null;
      return h_flex().id(`jq-mention-${i}`).px(8).py(4).gap(8).items_center().rounded(6).cursor_pointer().text_size(12)
        .hover((s) => s.bg(t.hover)).on_click((_e, cx) => v.pickMention(c.handle, cx))
        .child(div().w(18).flex_none().child(m ? m.member.glyph : "📣"))
        .child(div().flex_none().font_medium().child(`@${c.handle}`))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(m ? m.doing : "every worker running"));
    }))
    .when(choices.length === 0, (e) => e.child(div().px(8).py(4).text_size(11.5).text_color(t.dim).child("No running worker by that name")));
}

// Who the message being typed goes to, said plainly.
function toLine(v, t) {
  const target = v.chatTarget();
  if (target.unknown.length) return note(`Nobody is called @${target.unknown.join(", @")}`, t, t.blocked);
  const names = handlesFor(target.jobs).map((h) => `@${h.handle}`);
  if (target.revive && !names.length) return note(`To a new ${target.revive.from}: it starts to act on your message`, t, t.muted);
  if (target.everyone) return note(target.jobs.length ? `To everyone running (${target.jobs.length}) · type @ to pick` : "Nobody is running; it is kept for later · type @ to pick", t);
  return note(`To ${names.join(", ")}`, t, t.muted);
}

export function chatPanel(v, t) {
  const items = v.chatItems(), live = party.listeners(), choices = v.mentionChoices();
  return v_flex().id("jq-chat").size_full().min_h(0).text_color(t.foreground)
    .child(h_flex().flex_none().px(12).py(9).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("💬 Party chat"))
      .child(div().flex_1())
      .child(note(live.length ? `${live.length} at work` : "nobody at work", t)))
    .child(v_flex().id("jq-chat-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(v.chatScroll).px(12).py(10).gap(10)
      .when(items.length === 0, (e) => e.child(note("Workers post questions, blockers and results here. Answer below; type @ to pick who.", t)))
      .children(items.map((item, i) => (item.event ? eventLine(t, item, i) : item.from === "you" ? mine(t, item, i) : theirs(v, t, item, i)))))
    .child(v_flex().flex_none().px(12).py(9).gap(6).border_t(1).border_color(t.border)
      .when(choices !== null, (e) => e.child(mentionList(v, t, choices)))
      .child(input(v.chatInput, t))
      .child(toLine(v, t)));
}
