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
    console.log(jsonData);
    for (const task of jsonData?.items) {
      console.log(`Adding task: ${task.title}`);

      await graphqlWithAuth(
        `
        mutation($projectId: ID!, $title: String!, $status: String!) {
          addProjectV2ItemById(
            input: { projectId: $projectId, title: $title }
          ) {
            item {
              id
            }
          }
        }
      `,
        {
          projectId: process.env.PROJECT_ID,
          title: task.title,
          status: task.status || "Todo",
        }
      );
    }

    console.log("✅ All tasks added successfully!");
  } catch (error) {
    console.error("❌ Error importing tasks:", error);
    process.exit(1);
  }
})();
