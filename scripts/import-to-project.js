const fs = require("fs");
const { graphql } = require("@octokit/graphql");

(async () => {
  try {
    const jsonData = JSON.parse(fs.readFileSync("learning-plan.json", "utf8"));

    const graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `bearer ${process.env.GH_PAT}`,
      },
    });

    for (const task of jsonData?.items) {
      console.log(`Adding task: ${task.title}`);

      await graphqlWithAuth(
        `
        mutation($projectId: ID!, $note: String!) {
          addProjectV2Item(input: { projectId: $projectId, content: { note: $note } }) {
            item {
              id
            }
          }
        }
      `,
        {
          projectId: process.env.PROJECT_ID,
          note: task.title, // pass the task title as note
        }
      );
    }

    console.log("✅ All tasks added successfully!");
  } catch (error) {
    console.error("❌ Error importing tasks:", error);
    process.exit(1);
  }
})();
