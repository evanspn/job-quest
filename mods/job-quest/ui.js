// The drawing pieces every part shares. Each takes the theme `t` and returns an element.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Textarea } from "gpui-base";

// A button; `primary` marks the main action of a group.
export function button(id, text, onClick, t, primary = false) {
  return h_flex().id(id).h(28).px(11).flex_none().items_center().rounded(7).cursor_pointer().text_size(12).font_medium()
    .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
    .text_color(primary ? t.solid_foreground : t.foreground)
    .hover((s) => s.opacity(0.88)).on_click((_e, cx) => onClick(cx)).child(text);
}

// A small toggle: a tab, a stage, a filter.
export function chip(id, text, active, onClick, t) {
  return h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).cursor_pointer().text_size(11.5)
    .bg(active ? t.selected : t.raised).text_color(active ? t.foreground : t.muted)
    .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(text);
}

export function heading(text, t, aside = "") {
  return h_flex().pt(6).gap(8).items_center()
    .child(div().font_semibold().text_color(t.foreground).child(text))
    .when(Boolean(aside), (e) => e.child(div().text_size(11).text_color(t.dim).child(aside)));
}

export const note = (text, t, color = t.dim) => div().text_size(11.5).text_color(color).child(text);

export const row = () => h_flex().gap(6).flex_wrap().items_center();

// A one-line text field around an InputState.
export function input(state, t) {
  return div().h(30).px(9).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background)
    .child(Input.new(state).h_full().text_size(12.5).text_color(t.foreground));
}

// A multi-line text field around a TextareaState.
export function area(state, height, t) {
  return div().h(height).px(9).py(6).rounded(7).border_1().border_color(t.input).bg(t.background)
    .text_size(12.5).text_color(t.foreground).child(Textarea.new(state));
}

// A label over a text field; draws the label alone until the field's state exists.
export function labelled(label, state, t) {
  return v_flex().gap(3)
    .child(div().text_size(11).text_color(t.muted).child(label))
    .when(Boolean(state), (e) => e.child(input(state, t)));
}

// A bordered box for a group of related things.
export const card = (t) => v_flex().p(10).gap(8).rounded(8).border_1().border_color(t.border).bg(t.background);

// A scrolling column that fills what is left of its parent.
export const scroller = (id) => v_flex().id(id).flex_1().min_h(0).overflow_y_scrollbar().px(14).py(12).gap(8);
