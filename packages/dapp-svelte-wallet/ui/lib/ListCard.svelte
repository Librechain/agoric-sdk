<script>
  import { slide } from 'svelte/transition';

  import List from 'smelte/src/components/List';

  import Icon from "smelte/src/components/Icon";
  import Card from "smelte/src/components/Card";
  import ListItem from 'smelte/src/components/List/ListItem.svelte';

  export let items = [];

  export let expandIcon = 'arrow_right';

  let expanded = [];

  const toggle = item => {
    // console.log('toggle', item);
    if (expanded.includes(item)) {
      expanded = expanded.filter(it => item !== it);
    } else {
      expanded = [...expanded, item];
    }
  };
</script>

<style>
  .actions {
    margin: 1em 0 0 2em;
  }
</style>

<section class="fullwidth px-2 py-2">
  <slot name="title"></slot>

  <slot></slot>

  <!-- All {JSON.stringify($issuers)} -->
  {#if !Array.isArray(items) || items.length === 0}
    <div class="ml-8"><slot name="empty">No items.</slot></div>
  {:else}
    <List {items}>
      <li slot="item" class="px-1" let:item>
        <div class="fullwidth px-1">
          <ListItem dense selectedClasses="bg-primary-trans" {item} {...item} on:click={() => toggle(item.id)}>
            <div class="flex items-center">
              <Icon tip={expanded.includes(item.id)}>{expandIcon}</Icon>
              <slot name="item-header" {item}><span>{item.text}</span></slot>
            </div>
          </ListItem>

          <div class="ml-10">
            <slot name="item-header-rest" {item}></slot>
          </div>

          {#if expanded.includes(item.id)}
            <div in:slide class="ml-10">
              <slot name="item-details" {item}></slot>
            </div>
          {/if}
        </div>
      </li>
    </List>
  {/if}

  <div class="actions">
    <slot name="actions"></slot>
  </div>
</section>
