<script lang="ts">
  import Toolbar from "./Toolbar.svelte";
</script>

<div class="loading-pane">
  <Toolbar ariaLabel="Viewer toolbar" />
  <div class="loading-body">
    <p>Processing files...</p>
  </div>
</div>

<style>
  .loading-pane { display: flex; flex: 1; min-height: 0; flex-direction: column; }
  .loading-body { flex: 1; display: flex; align-items: center; justify-content: center; color: #374151; }
</style>

