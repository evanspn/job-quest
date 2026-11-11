// The party chat: one feed of what the workers post, your replies and the party's events, and a
// box to answer a worker or everyone. Reads the view `v`; touches no files.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { MEMBERS } from "./model.js";
import * as party from "./party.js";
import { chip, note, input } from "./ui.js";

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
          .tooltip(job ? "Reply to this worker" : "It has finished: replying starts a new one to act on your answer")
          .on_click((_e, cx) => v.replyTo(item, cx)).child("Reply"))
        .when(Boolean(job), (e) => e
          .child(h_flex().id(`jq-chat-${i}-watch`).px(5).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
            .on_click(() => v.showJob(job)).child("Watch"))))
      .child(div().px(10).py(6).rounded(10).bg(t.raised).text_size(12).text_color(t.foreground).child(item.text)));
}

export function chatPanel(v, t) {
  const items = v.chatItems(), live = party.listeners(), target = v.chatTarget();
  const chosen = (job) => !target.all && target.jobs[0]?.key === job.key;
  const recipient = (job, i) => {
    const { member } = party.describe(job);
    return chip(`jq-chat-to-${i}`, `${member.glyph} ${job.member}${job.appId ? `/${job.appId.split("-")[0]}` : ""}`, chosen(job),
      (cx) => v.chooseChatTo(party.agentFor(job)?.address ?? null, cx), t);
  };
  return v_flex().id("jq-chat").size_full().min_h(0).text_color(t.foreground)
    .child(h_flex().flex_none().px(12).py(9).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("💬 Party chat"))
      .child(div().flex_1())
      .child(note(live.length ? `${live.length} at work` : "nobody at work", t)))
    .child(v_flex().id("jq-chat-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(v.chatScroll).px(12).py(10).gap(10)
      .when(items.length === 0, (e) => e.child(note("Workers post questions, blockers and results here. Answer them below.", t)))
      .children(items.map((item, i) => (item.event ? eventLine(t, item, i) : item.from === "you" ? mine(t, item, i) : theirs(v, t, item, i)))))
    .child(v_flex().flex_none().px(12).py(9).gap(6).border_t(1).border_color(t.border)
      .child(h_flex().gap(5).flex_wrap().items_center()
        .child(div().text_size(11).text_color(t.muted).child("To"))
        .when(live.length > 1, (e) => e.child(chip("jq-chat-to-all", "Everyone", target.all, (cx) => v.chooseChatTo("all", cx), t)))
        .when(Boolean(target.revive), (e) => e.child(chip("jq-chat-to-revive", `↩ a new ${target.revive.from}${target.revive.appId ? `/${target.revive.appId.split("-")[0]}` : ""}`, true, () => {}, t)))
        .children(live.map(recipient))
        .when(live.length === 0 && !target.revive, (e) => e.child(note("nobody is running; it is kept for later", t))))
      .child(input(v.chatInput, t)));
}
