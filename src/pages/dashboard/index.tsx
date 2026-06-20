import { Badge, Input, Card, Empty, Button } from "@/components";
import { useHistory, useKrishna } from "@/hooks";
import { PageLayout } from "@/layouts";
import { deleteAllConversations } from "@/lib/database";
import { MessageCircleIcon, Search, Trash2, XCircleIcon } from "lucide-react";
import moment from "moment";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const conversations = useHistory();
  const { lastError, clearLastError } = useKrishna();
  const navigate = useNavigate();

  const groupedConversations = conversations.conversations.reduce(
    (acc, doc) => {
      const dateKey = moment(doc.updatedAt).format("YYYY-MM-DD");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(doc);
      return acc;
    },
    {} as Record<string, typeof conversations.conversations>
  );

  const sortedDates = Object.keys(groupedConversations).sort((a, b) =>
    moment(b).diff(moment(a))
  );

  const handleClearAll = async () => {
    await deleteAllConversations();
    conversations.refreshConversations();
  };

  return (
    <PageLayout
      title="Dashboard"
      description="Krishna — your AI voice assistant"
    >
      <>
        {lastError && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            <span>{lastError}</span>
            <button onClick={clearLastError} className="ml-2 shrink-0">
              <XCircleIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {conversations.conversations.length === 0 ? (
          <Empty
            isLoading={conversations.isLoading}
            icon={MessageCircleIcon}
            title="No conversations found"
            description="Start a new conversation to get started"
          />
        ) : (
          <div className="flex flex-col gap-6 pb-8">
            <div className="flex items-center justify-between">
              <div className="relative w-1/3">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  className="pl-9 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={conversations.search}
                  onChange={(e) => conversations.setSearch(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={handleClearAll}>
                Clear all
              </Button>
            </div>
            {sortedDates
              .filter((dateKey) =>
                conversations?.search?.length === 0
                  ? true
                  : groupedConversations?.[dateKey]?.some((doc) =>
                      doc?.title
                        .toLowerCase()
                        .includes(conversations?.search?.toLowerCase() || "")
                    )
              )
              .map((dateKey) => (
                <div key={dateKey} className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground select-none font-medium">
                    {moment(dateKey).format("ddd, MMM D")}
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {groupedConversations[dateKey].map((doc) => (
                      <Card
                        key={doc.id}
                        className="shadow-none select-none p-4 gap-0 group relative transition-all !bg-black/5 dark:!bg-white/5 hover:!border-primary/50 cursor-pointer"
                        onClick={() => navigate(`/chats/view/${doc.id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="line-clamp-1 text-sm mr-8">
                            {doc.title}
                          </p>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {doc.messages.length} messages
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {moment(doc.updatedAt).format("hh:mm A")}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-1">
                          {conversations.deleteConfirm === doc.id ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">Delete?</span>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); conversations.confirmDelete(); }}
                              >
                                Yes
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={(e) => { e.stopPropagation(); conversations.cancelDelete(); }}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); conversations.handleDeleteConfirm(doc.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </>
    </PageLayout>
  );
};

export default Dashboard;
