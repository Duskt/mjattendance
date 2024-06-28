"use strict";
(() => {
  // src/components/index.ts
  var Component = class {
    element;
    constructor(params) {
      let tag = params.tag;
      this.element = params.element ? params.element : document.createElement(tag);
      this.element._ParentComponent = this;
      let parent = params.parent;
      if (parent) parent.appendChild(this.element);
      let style = params.style || {};
      for (const styleTag in style) {
        let styleItem = style[styleTag];
        if (styleItem == null) {
          continue;
        }
        this.element.style[styleTag] = styleItem;
      }
      if (params.textContent) this.element.textContent = params.textContent;
      if (params.value) this.element.value = params.value;
      let classList = params.classList || [];
      for (const c of classList) {
        this.element.classList.add(c);
      }
      for (const i in params.other) {
        this.element[i] = params.other[i];
      }
    }
  };

  // src/request.ts
  async function request(path2, payload, method = "POST") {
    let url = "http://localhost:5654/" + (path2[0] != "/" ? path2 : path2.slice(1));
    let r = await fetch(url, {
      method,
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      }
    });
    return r;
  }

  // src/components/deleteButton.ts
  var DeleteButton = class extends Component {
    constructor(params) {
      let onclick = params.other?.onclick || (async (ev) => {
        let r = await request("/tables", { "table_no": params.tableNo }, "DELETE");
        if (!r.redirected) {
          if (ev.target instanceof HTMLElement) ev.target.parentElement?.parentElement?.parentElement?.remove();
        }
      });
      let classList = params.classList || ["small-button", "delete-button"];
      let textContent = params.textContent || "X";
      super({
        ...params,
        tag: "button",
        classList,
        textContent,
        other: {
          ...params.other,
          onclick
        }
      });
    }
  };

  // src/components/focus/index.ts
  var FocusNode = class extends Component {
    exclude;
    excludeSelf;
    excludeChildren;
    listener;
    active;
    // todo: add more DocumentEventMaps
    deactivation = "click";
    constructor(params) {
      super(params);
      this.exclude = params.exclude || [];
      this.excludeSelf = params.excludeSelf || true;
      this.excludeChildren = params.excludeChildren || true;
      this.active = false;
      return this;
    }
    activate() {
      this.listener = (ev) => {
        let target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        if (this.excludeSelf && target.isSameNode(this.element)) return;
        let parent = target.parentElement;
        while (this.excludeChildren && parent) {
          if (parent.isSameNode(this.element)) return;
          parent = parent.parentElement;
        }
        if (this.exclude.includes(target)) return;
        this.deactivate();
      };
      this.active = true;
      document.addEventListener(this.deactivation, this.listener);
      return this;
    }
    deactivate() {
      this.active = false;
      if (this.listener) document.removeEventListener(this.deactivation, this.listener);
      return this;
    }
  };
  var FocusButton = class extends FocusNode {
    deactivation = "click";
    constructor(params = {}) {
      super({
        tag: "button",
        ...params
      });
      this.element.onclick = (ev) => {
        if (this.excludeChildren && ev.target != this.element) {
          return;
        }
        if (this.active) {
          this.deactivate();
        } else {
          this.activate();
        }
      };
    }
  };

  // src/components/focus/dropdown.ts
  var Dropdown = class {
    options;
    element;
    constructor(options) {
      this.element = new Component({
        tag: "div",
        classList: ["dropdown"]
      }).element;
      this.updateOptions(options);
      this.options = options;
    }
    updateOptions(options) {
      this.options = options;
      Array.from(this.element.children).forEach((c) => c.remove());
      this.options.forEach((v) => this.element.appendChild(v));
    }
  };
  var DropdownButton = class extends FocusButton {
    dropdown;
    constructor(params) {
      let classList = params.classList || ["small-button", "dropdown-button"];
      let options = params.options || [];
      super({ ...params, classList });
      this.dropdown = new Dropdown(options);
    }
    activate() {
      this.element.appendChild(this.dropdown.element);
      return super.activate();
    }
    deactivate() {
      this.element.removeChild(this.dropdown.element);
      return super.deactivate();
    }
  };

  // src/components/nametag.ts
  var NameTag = class extends Component {
    nameOptions;
    constructor(params) {
      super({
        tag: "select",
        ...params,
        value: void 0
      });
      this.nameOptions = {};
      if (params.value) {
        this.renderOption(params.value);
      } else {
        this.renderPlaceholder();
      }
      ;
      for (const m of window.MJDATA.members) {
        if (m.id === params.value?.id) continue;
        this.renderOption(m);
      }
      this.element.addEventListener("input", async (ev) => {
        console.debug("Nametag select input event:", ev.target);
        let newMember = window.MJDATA.members.find((v) => v.name === this.element.value);
        if (!newMember) throw Error("<option> had an unlisted member name");
        let table = window.MJDATA.tables.find((v) => v.table_no === params.table_no);
        if (!table) throw Error("table_no is incorrect or out of date");
        console.debug("newMember", newMember, "new table", table);
        table[params.seat] = newMember.id;
        await request("/tables", {
          table_no: params.table_no,
          table
        }, "PUT");
      });
    }
    renderOption(member) {
      let optElem = document.createElement("option");
      optElem.textContent = member.name;
      this.nameOptions[member.id] = optElem;
      this.element.appendChild(optElem);
      return optElem;
    }
    renderPlaceholder() {
      let optElem = document.createElement("option");
      optElem.textContent = "EMPTY";
      this.element.appendChild(optElem);
      return optElem;
    }
  };

  // src/components/player.ts
  var WinButton = class extends FocusButton {
    // there are two types of wins:
    zimo;
    // 'self-draw' points are split between the table's other 3 players
    dachut;
    // 'direct hit' points are taken from one player, needing two dropdowns.
    constructor(params) {
      super(params);
      this.zimo = new FaanDropdownButton({
        textContent: "\u81EA\u6478"
      });
      this.dachut = new DropdownButton({
        textContent: "\u6253\u51FA"
      });
      this.updatePlayers(params.otherPlayers);
    }
    activate() {
      this.element.style["width"] = "100px";
      this.element.appendChild(this.zimo.element);
      this.element.appendChild(this.dachut.element);
      return super.activate();
    }
    deactivate() {
      this.element.style["width"] = "";
      for (const c of Array.from(this.element.children)) {
        this.element.removeChild(c);
      }
      return super.deactivate();
    }
    updatePlayers(otherPlayers) {
      this.dachut.dropdown.updateOptions(otherPlayers.map((v) => new FaanDropdownButton({
        textContent: window.MJDATA.members.find((m) => m.id === v)?.name,
        classList: ["small-button"]
      }).element));
    }
  };
  var FaanDropdownButton = class extends DropdownButton {
    min;
    max;
    constructor(params) {
      let min = params.min || 3;
      let max = params.max || 13;
      let faanRange = Array.from(Array(max + 1).keys()).slice(min);
      let options = faanRange.map((faan) => new Component({
        tag: "button",
        classList: ["small-button"],
        textContent: faan.toString(),
        other: {
          onclick: (ev) => {
            alert(`Took ${faan} faan!`);
          }
        }
      }).element);
      super({ ...params, options });
      this.min = min;
      this.max = max;
    }
  };
  var PlayerTag = class {
    constructor(parent, table, seat) {
      this.parent = parent;
      this.table = table;
      this.seat = seat;
      this.player = new Component({
        tag: "td",
        parent,
        classList: ["player"]
      });
      this.nameTag = new NameTag({
        classList: ["name-tag", seat],
        parent: this.player.element,
        table_no: table.table_no,
        seat,
        value: window.MJDATA.members.find((v) => v.id === table[seat])
      });
      let otherPlayers = ["east", "south", "west", "north"].filter((v) => v != seat).map((v) => table[v]);
      if (otherPlayers.length != 3) {
        console.error(this.player, `got ${otherPlayers.length} other players when expecting 3:`, otherPlayers);
      }
      this.winButton = new WinButton({
        otherPlayers,
        textContent: "\u98DF",
        parent: this.player.element,
        classList: ["win-button", "small-button"]
      });
    }
    // the component (a table cell element) 'player'...
    player;
    // contains the nametag (input) and winbutton components
    nameTag;
    winButton;
    update(table) {
      this.table = table;
      let otherPlayers = ["east", "south", "west", "north"].filter((v) => v != this.seat).map((v) => table[v]);
      this.winButton.updatePlayers(otherPlayers);
    }
  };

  // src/components/focus/dialog.ts
  var Dialog = class extends FocusNode {
    activator;
    excludeSelf = false;
    constructor({ activator, ...params }) {
      super(params);
      this.activator = activator;
      let dialog = this;
      if (!this.activator.onclick) {
        this.activator.onclick = (ev) => {
          dialog.activate();
        };
      }
      this.exclude.push(this.activator);
      this.element.style["padding"] = "0";
    }
    activate() {
      this.element.showModal();
      return super.activate();
    }
    deactivate() {
      this.element.close();
      return super.deactivate();
    }
  };

  // src/components/sidebar.ts
  function renderSidebar() {
    let sidebar = document.getElementsByClassName("sidebar")[0];
    if (!(sidebar instanceof HTMLElement)) {
      throw Error("Could not find sidebar");
    }
    let sidebarButton = Array.from(sidebar.children).find((v) => v.tagName == "BUTTON");
    if (!(sidebarButton instanceof HTMLButtonElement)) {
      throw Error("Could not find sidebarButton");
    }
    let sidebarDiv = Array.from(sidebar.children).find((v) => v.tagName == "DIV");
    if (!(sidebarDiv instanceof HTMLElement)) {
      throw Error("Could not find sidebarDiv");
    }
    let closeSidebar = () => {
      sidebar.classList.replace("open", "closed");
      sidebarButton.textContent = ">";
    };
    let openSidebar = () => {
      sidebar.classList.replace("closed", "open");
      sidebarButton.textContent = "<";
    };
    sidebar.style["transition"] = "none";
    sidebar.classList.add("closed");
    setTimeout(() => sidebar.style["transition"] = "", 1);
    sidebarButton.onclick = () => {
      if (sidebarButton.textContent == ">") openSidebar();
      else closeSidebar();
    };
    let addMemberButton = document.getElementById("add-member");
    if (!(addMemberButton instanceof HTMLButtonElement)) {
      throw Error("no #add-member button");
    }
    let form = document.getElementById("name")?.parentElement;
    if (!(form instanceof HTMLFormElement)) {
      throw Error("no form");
    }
    let dialog = new Dialog({
      tag: "dialog",
      element: document.getElementsByTagName("dialog")[0],
      activator: addMemberButton
    });
    let memberList = new MemberList({
      tag: "ul",
      parent: sidebarDiv
    });
    form.onsubmit = (ev) => {
      ev.preventDefault();
      let name = new FormData(form).get("name");
      if (!name) {
        throw Error("no name");
      }
      request("/members", { name }, "POST").then((v) => {
        if (v.ok) v.json().then(
          (v2) => {
            window.MJDATA.members.push(v2);
            memberList.renderLi(v2);
          }
        );
      });
      dialog.deactivate();
    };
  }
  var MemberList = class extends Component {
    memberElems;
    constructor(params) {
      super(params);
      this.memberElems = {};
      window.MJDATA.members.forEach((m) => this.renderLi(m));
    }
    renderLi(member) {
      let melem = document.createElement("li");
      melem.textContent = `${member.name}: ${member.points}`;
      this.memberElems[member.id] = melem;
      this.element.appendChild(melem);
      return melem;
    }
  };

  // src/pages/tables.ts
  function tables() {
    let table_table = document.getElementById("table");
    if (!table_table) throw Error("No element with the table id is present.");
    let current_row = document.createElement("tr");
    let n_cols = Math.ceil(Math.sqrt(window.MJDATA.tables.length));
    let index = 0;
    let td = document.createElement("td");
    for (const i of window.MJDATA.tables) {
      index++;
      if (index > n_cols) {
        table_table.appendChild(current_row);
        current_row = document.createElement("tr");
        index = 0;
      }
      td.appendChild(renderPlayerTable(td, i));
      current_row.appendChild(td);
      td = document.createElement("td");
    }
    table_table.appendChild(current_row);
    renderSidebar();
  }
  function renderPlayerTable(parent, mahjongTable) {
    let innerTable = document.createElement("table");
    let innerRows = [document.createElement("tr"), document.createElement("tr"), document.createElement("tr")];
    innerRows[0].appendChild(document.createElement("td"));
    let west = new PlayerTag(innerRows[0], mahjongTable, "west");
    innerRows[0].appendChild(document.createElement("td"));
    let north = new PlayerTag(innerRows[1], mahjongTable, "north");
    let inner_table_display = document.createElement("td");
    inner_table_display.classList.add("mahjong-table-display");
    inner_table_display.textContent = mahjongTable.table_no.toString();
    innerRows[1].appendChild(inner_table_display);
    let south = new PlayerTag(innerRows[1], mahjongTable, "south");
    innerRows[2].appendChild(document.createElement("td"));
    let east = new PlayerTag(innerRows[2], mahjongTable, "east");
    let deleteButtonCell = document.createElement("td");
    let deleteButton = new DeleteButton({
      parent: deleteButtonCell,
      tableNo: mahjongTable.table_no
    });
    innerRows[2].appendChild(deleteButtonCell);
    let players = [east, south, west, north];
    innerTable.addEventListener("input", (ev) => {
      let target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      let input = players.map((v) => v.nameTag.element).find((v) => v.isSameNode(target));
      if (!input) {
        console.error("Input registered in table outside of a nameTag input at:", ev.target);
        throw new Error("unidentified input in table update");
      }
      let player = players.find((v) => v.nameTag.element == input);
      if (!player) {
        console.error("Could not identify the player this nameTag belongs to:", input);
        throw new Error("undefined player in table update");
      }
      for (const otherPlayer of players.filter((v) => v != player)) {
        otherPlayer.update(player.table);
      }
    });
    innerRows.forEach((i) => innerTable.appendChild(i));
    return innerTable;
  }

  // src/index.ts
  function path() {
    return window.location.href.split("/").slice(3).join("/");
  }
  if (["tables", "table"].some((x) => x == path())) {
    document.addEventListener("DOMContentLoaded", tables);
  }
})();
