<script lang="ts">
  import NewTab from "../components/NewTab.svelte";

  let { oncustomize }: { oncustomize?: () => void } = $props();
</script>

<!-- The pane Shell gives a new tab, with a stand-in for the field. -->
<div class="content-pane" data-ground="own" style="block-size: 100vh">
  <NewTab {oncustomize}
    >{#snippet search()}<input
        aria-label="Search the web"
        style="inline-size: 100%"
      />{/snippet}</NewTab
  >
</div>
