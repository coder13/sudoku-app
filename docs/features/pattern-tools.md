# Pattern tools in Play

Open **Input tools** to show or hide a solving tab. The menu stays open while you toggle panels. Scroll the tab row horizontally when the tabs extend beyond the panel. On mobile, drag the divider to resize the input card. Double-tap it or focus it and press Enter to expand the active panel as far as its content and the available space allow. The card keeps its height when you switch tabs. Close all tool tabs to return to the normal keypad height.

Open tools and the selected tab follow you when you switch between mobile and desktop widths. Reloading Sudoku restores them, along with the input card height you chose on mobile. A revealed **Solution** returns to the selected step, and **Techniques** keeps its filter.

Pausing hides the contents of **Solution** and **Techniques**. Resume the puzzle to see them again.

Right-click a cell and choose **Make subset** to save it. To save several cells, select them first and right-click one of them. You can also open the board menu with **Shift+F10**. In **Subsets**, choose **New subset** and select a cell to start a card. The card updates as you add or remove cells. Choose **Done editing subsets**, press **Escape**, or switch tabs to save the set. The pencil edits a saved set. The eye and delete buttons work while editing and after saving.

In **Subset display options**, turn on **Show eliminations** to preview deductions from shown saved sets. **Apply edits** removes those candidates. **Show strong links** displays candidate relationships inside the shown sets.

Shown subsets and their board marks stay visible when you switch tabs while **Subsets** is open.

While drawing a new chain, click a candidate in a shown ALS to start the chain. Click the restricted common candidate in the next set to link it. You can also click a compatible candidate in a shown ALS to join it to the end of a drawn path. When several sets match the same click, click an occurrence unique to the set or temporarily hide the other sets. To build a Death Blossom, select a candidate in the stem cell, then use **Chain actions** to link a saved petal for each stem candidate. Turn on **Show eliminations** in **Chain display options** to preview verified removals before applying them.

To continue past an ALS, click another digit in the set or click an outside candidate that conflicts with every occurrence of that digit in the set. The AIC records the strong link between the two digits within the ALS. Resume drawing candidate links and enter another shown ALS from a strong link as often as the path allows. Show eliminations displays the removals below the notation.

In an ALS chain, the ON and OFF colors follow the assumption shown on the chain card. When ON highlights several candidates for the same digit in one set, that digit must go in one of those cells.

Use **Combine Set** in **Chain actions** to check saved sets together for XYZ-Wing, WXYZ-Wing, or Sue de Coq. For Sue de Coq, combine the intersection, the line set, and the box set. You can also show the sets that make up the pattern in Subsets and preview the removals there.

Open **Chains** and select **Show strong links**. Press 1–9 or tap the keypad to switch the highlight to one digit. Press the same digit again to clear it. Hold a digit on the mobile keypad or press **Shift+1–9** to toggle that digit without changing the others. With no selected digits, the overlay shows no automatic links or highlights. If you highlight both digits in a two-candidate cell, the overlay also marks that link.

The overlay cycles through five pairs, with two alternating colors per connected group. Select a candidate or line to add its connected links, starting with **Chain 1**. The selected candidate becomes the endpoint for the next link. Other strong links stay visible while you draw branches. Turn off **Show strong links** to hide the automatic overlay.

Choose **End path** to clear the current endpoint while you keep drawing. A link to an existing path extends its chain. The first link of a disconnected path opens a separate chain card. You can also start with **New chain**.

The overlay stays visible when you switch to the mobile Digits tab or the Advanced workspace Input tab.

The grid badge shows a chain icon while **Chains** is active and you draw links. Select the badge to stop the drawing.

Selecting a digit in Pen, Pencil, or Highlight mode highlights matching cells. Candidate Colors uses a colored shape and matching text. With **Show strong links** off, Chains highlights matching cells and cells with possible link targets. The candidates that can form a link also stand out within their cells. Connected candidates have a solid fill and contrasting text. A ring marks the selected endpoint.

Choose **Highlight mode** to select multiple cells and edit their digits or candidates while a solving tool tab stays open. In Pen, Pencil, and Highlight modes, use **Shift+1–9** to toggle digits and match any highlighted digit. With no cells selected, **Cmd/Ctrl+1–9** toggles digits and matches all highlighted digits. With cells selected, **Cmd/Ctrl+1–9** toggles candidates and unmodified digit keys place digits. Digit and candidate edits from the keyboard or keypad keep the active highlights.

Shift-click keypad digits for **Any**, or Cmd/Ctrl-click for **All**. With multiple digits selected, the **All / Any** button switches the rule and keeps your selection. **Any** shades cells that contain only selected candidates and highlights individual matches in cells with other candidates. **All** shades cells that contain every selected digit.

The menu buttons preserve the selected cells and digit. The background stays blurred when you change sections in Settings.
