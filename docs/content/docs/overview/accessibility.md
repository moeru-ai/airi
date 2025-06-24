---

title: Accessibility
description: Reka UI follow the WAI-ARIA authoring practices guidelines and are tested in a wide selection of modern browsers and commonly used assistive technologies.
---

# Accessibility
<Description>
Reka UI follow the WAI-ARIA authoring practices guidelines and are
tested in a wide selection of modern browsers and commonly used assistive
technologies.
</Description>

We take care of many of the difficult implementation details related to accessibility, including `aria` and `role` attributes, focus management, and keyboard navigation. That means that users should be able to use our components as-is in most contexts and rely on functionality to follow the expected accessibility design patterns.

## WAI-ARIA

[WAI-ARIA](https://www.w3.org/TR/wai-aria-1.2/), published and maintained by the W3C, specifies the semantics for many common UI patterns that show up in Reka UI. This is designed to provide meaning for controls that aren't built using elements provided by the browser. For example, if you use a `div` instead of a `button` element to create a button, there are attributes you need to add to the `div` in order to convey that it's a button for screen readers or voice recognition tools.

In addition to semantics, there are behaviors that are expected from different types of components. A `button` element is going to respond to certain interactions in ways that a `div` will not, so it's up to the developer to reimplement those interactions with JavaScript. The [WAI-ARIA authoring practices](https://www.w3.org/TR/wai-aria-practices-1.2/) provide additional guidance for implementing behaviors for various controls that come with Reka UI.

## Accessible Labels

With many built-in form controls, the native HTML `label` element is designed to provide semantic meaning and context for corresponding `input` elements. For non-form control elements, or for custom controls like those provided by Reka UI, [WAI-ARIA provides a specification](https://www.w3.org/TR/wai-aria-1.2/#namecalculation) for how to provide accessible names and descriptions to those controls.

Where possible, Reka UI include abstractions to make labelling our controls simple. The [`Label`](../components/label) primitive is designed to work with many of our controls. Ultimately it's up to you to provide those labels so that users have the proper context when navigating your application.

## Keyboard Navigation

Many complex components, like [`Tabs`](../components/tabs) and [`Dialog`](../components/dialog), come with expectations from users on how to interact with their content using a keyboard or other non-mouse input modalities. Reka UI provide basic keyboard support in accordance with the [WAI-ARIA authoring practices](https://www.w3.org/TR/wai-aria-practices-1.2/).

## Focus Management

Proper keyboard navigation and good labelling often go hand-in-hand with managing focus. When a user interacts with an element and something changes as a result, it's often helpful to move focus with the interaction so that the next tab stop is logical depending on the new context of the app. And for screen reader users, moving focus often results in an announcement to convey this new context, which relies on proper labelling.

In many Reka UI, we move focus based on the interactions a user normally takes in a given component. For example, in [`AlertDialog`](../components/alert-dialog), when the modal is opened, focus is programmatically moved to a `Cancel` button element to anticipate a response to the prompt.
