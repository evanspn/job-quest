import { element } from "./gpui-kit.mjs";

export const v_flex = () => element("v_flex");
export const h_flex = () => element("h_flex");

class TextState {
  constructor(options = {}) { this.text = options.value ?? ""; this.placeholder = options.placeholder ?? ""; this.handlers = {}; }
  value() { return this.text; }
  set_value(text) { this.text = text; }
  on(event, handler) { this.handlers[event] = handler; }
  focus() {}
  set_auto_grow() {}
  // For tests: what the person does.
  type(text) { this.text = text; this.handlers.change?.({}, { notify() {} }); }
  submit(cx) { this.handlers.submit?.({}, cx); }
}

export class InputState extends TextState { static new(options) { return new InputState(options); } }
export class TextareaState extends TextState { static new(options) { return new TextareaState(options); } }
export class EditorState extends TextState { static new(options) { return new EditorState(options); } }
export const Editor = { new: (state) => element("editor", state) };
export const Input = { new: (state) => element("input", state) };
export const Textarea = { new: (state) => element("textarea", state) };
export const TextView = { markdown: (id, text) => element("markdown").id(id).child(text) };

export const ScrollHandle = { new: () => ({ scrolled: [], scroll_to_item(i) { this.scrolled.push(i); }, release() { return true; } }) };
